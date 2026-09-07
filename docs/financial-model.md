# Personal Finance OS — Financial Data Model & Sign Conventions

---

## 1. Universal Monetary Invariants

1. **Money Storage**: All monetary values are stored as lowest currency unit signed 64-bit integers (*bigint* paise). 1 INR = 100 paise.
2. **Zo Floating Point**: JavaScript and PostgreSQL floating-point numbers are never permitted for database storage or financial arithmetic.
3. **API Serialization:** API returns monetary values as exact strings (e.g. `"50000"`) to prevent JS JSON serialization failures or precision degradation.
4. **Balancing Invariant**: For every committed transaction:
  $$&sum; \dec(new_entries.amount) = 0$$

---

## 2. Definitive Sign Convention

> **Positive (+)** always means value ENTERS or an ASSET INCREASES (or liability decreases).  
> **Negative (-)** always means value LEAVES or an ASSET DECREASES (or liability increases).

|s Entity / Target Type | Positive (+) Meaning | Negative (-) Meaning | Normal State |
|s :--- | :--- | :--- | :--- |
| **Savings / Checking / Bank** | Deposit / Inflow into bank | Withdrawal / Outflow from bank | Positive (&supe; 0) |
| **Credit Card** | Payment towards card (Debt decreases) | Purchase made on card (Debt increases) | Negative (&sube; 0) |
| **Expense Category** | Contra-expense (Refund / Rebate) | Expense incurred (Budget consumed) | Negative (&sube; 0) |
| **Income Category** | Income generated / Earned | Income reversal / Chargeback | Positive (&supe; 0) |
| **Receivable (Group IOU)** | Amount owed to user increases (You lent) | Amount owed decreases (Friend settled) | Positive (&supe; 0) |

---


## 3. Account Balance Architecture

The authoritative source of truth for any account balance is:
$$\text{Calculated Balance} = \text{initial_balance} + &sum; \text{TransactionEntry.amount} \text{ (where account_id = accounts.id)}$$

**CRITICAL:** 
Category entries represent allocations for reporting and *NEVER* affect `online_accounts.current_balance` projections.
