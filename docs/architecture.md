# Personal Finance OS — Architecture & Implementation

---

## 1. System Overview

**Personal Finance OS** is a modern financial management platform designed as a *Modular Monolith*.

**Key Financial Invariants:**
1. All monetary values are stored as *signed 64-bit BigInt paise* (₹1.00 = 100 paise). Floating-point rounding errors are strictly prevented.
2. Transaction model follows a *Header + Line Items (Transaction + TransactionEntry) Split Ledger* where every committed transaction satisfies: SUM(transaction_entries.amount) == 0.
3. Ledger entries are the authoritative source of truth; ccounts.current_balance is a cached projection protected by pessimistic row locks (SELECT ... FOR UPDATE).
4. Strict Tenant Isolation enforces that users can never reference or access another user\'s accounts, categories, transactions, or refresh sessions.

---

## 2. Monorepo Structure

`	ext
personal-finance-os/
├── apps/
│   ├── api/                  # NestJS + Prisma + PostgreSQL
│   ├── web/                  # React + Vite + Tailwind CSS
│   └── mobile/               # Flutter (foundation placeholder)
├── packages/
│   └── shared-types/         # Canonical TypeScript enums, DTOs, math rules
├── docker/                   # Local PostgreSQL 16 configuration
├── docs/                     # Architecture and financial model specs
└── package.json
`

---

## 3. Backend Modules

1. **AuthModule**: Authentication, Argon2id password hashing, short-lived JWT access tokens, concurrency-safe refresh-token rotation, and revocation.
2. **UsersModule**: User profile management, base currency preference, authenticated user context (GET /api/v1/users/me).
3. **AccountsModule**: Bank, Cash, Credit Card, and Investment account management, balance reconciliation.
4. **CategoriesModule**: System defaults and user-custom hierarchical categories.
5. **TransactionsModule**: Double-entry ledger engine, splits, balance delta maintenance, invariant enforcement (SUM == 0).
6. **IngestionModule**: Statement upload, duplicate fingerprinting, staging preview, and ledger commits.

---

## 4. Authentication & Security Architecture (Phase 2)

### 4.1 Password Hashing (Argon2id)
* Algorithm: Argon2id (OWASP recommended password hashing algorithm).
* Parameters:
  * 	ype: argon2.argon2id
  * memoryCost: 65536 (64 MB)
  * 	imeCost: 3 iterations
  * parallelism: 1 thread
* Defense against Timing Attacks: When login is attempted with an unknown email or inactive user, a dummy Argon2id hash verification is executed with identical cost parameters before returning a generic 401 Unauthorized error.

### 4.2 Dual-Token Session Model
1. **Access Token**:
   * Format: Signed JWT.
   * Lifespan: 15 minutes (jwtAccessExpiresInSeconds = 900).
   * Payload: { sub: user.id, type: 'access', iat, exp }.
   * Stateless verification: Verified locally on every request via JwtStrategy and JwtAuthGuard.

2. **Refresh Token**:
   * Format: Cryptographically secure 40-byte random hex string (crypto.randomBytes(40).toString('hex')).
   * Lifespan: 7 days (expiresAt = NOW() + 7 days).
   * Persistence: Raw tokens are NEVER stored in the database. Only SHA-256 hashes (	oken_hash = SHA256(raw_token)) are persisted in the 
efresh_sessions table.

### 4.3 Concurrency-Safe Refresh-Token Rotation (Security Patch)
To prevent race conditions where two simultaneous requests with the same unrevoked refresh token could both succeed:
* Single-use rotation uses an **atomic conditional update** (test-and-set) inside prisma.:
  1. **Atomic Claim**:
     `sql
     UPDATE refresh_sessions
     SET revoked_at = , last_used_at = 
     WHERE token_hash = 
       AND revoked_at IS NULL
       AND expires_at > 
     `
     Under PostgreSQL row-level locking (EvalPlanQual), exactly ONE concurrent transaction can acquire the row write lock and find 
evoked_at IS NULL.
  2. **Claim Failure Handling**:
     If claimResult.count === 0, the transaction queries 
efreshSession.findUnique:
     - If 
evoked_at !== null, a token reuse attempt is detected and logged (	his.logger.warn(...)), throwing 401 Unauthorized ('Invalid or revoked refresh token').
     - If expires_at <= now, throws 401 Unauthorized ('Refresh token has expired').
     - Otherwise, throws 401 Unauthorized ('Invalid or expired refresh token').
  3. **Winner Execution**:
     Only the transaction that claimed the row (count === 1) fetches the session and associated user.
  4. **Active Status Verification**:
     Validates that user.isActive === true and user.deletedAt === null.
  5. **Atomic Replacement Creation**:
     Generates and inserts the replacement RefreshSession row within the same database transaction.
  6. **Token Issuance**:
     Signs and returns the new JWT access token and replacement refresh token.

### 4.4 User Isolation & Identity Resolution
* Zero Trust for Client Identity: No route accepts userId from request parameters or request body to identify the acting user.
* Identity is derived exclusively from the cryptographically verified JWT:
  `	ypescript
  @CurrentUser() user: AuthenticatedUser
  `
* All database operations in subsequent domain modules are scoped by where: { userId: user.id }.

### 4.5 Logout Flow
* POST /api/v1/auth/logout: Atomically updates 
efresh_sessions via conditional update:
  UPDATE refresh_sessions SET revoked_at = NOW() WHERE token_hash =  AND revoked_at IS NULL.
* Returns { success: true, message: 'Logged out successfully' }.

---

## 5. Deferred Infrastructure

* **Redis / BullMQ**: Deferred until async PDF OCR / background statement parsing phases. MVP CSV ingestion is synchronous and maintains sub-70ms transaction response times.
