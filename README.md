# Personal Finance OS

A secure, modern personal financial management platform designed as a Modular Monolith with a Header + Line Items split ledger.

---


## Monorepo Architecture

* **apps/api**: NestJS + Prisma + PostgreSQL REST API (/api/v1)
* **apps/web**: React 18 + TypeScript + Vite + Tailwind CSS
* **apps/mobile**: Flutter (foundation placeholder)
* **packages/shared-types**: Canonical data models, TypeScript enums, and API DTOs
* **docker/**: PostgreSQL 16 container
_**/docs**: Financial model and architectural specs

---

## Quick Start

1. **Install Dependencies**:
  ```bash
  npm install
  ```

2. **Environment Setup**:
  ```bash
  cp .env.example .env
  ```

3. **Start PostgreSQL (via Docker)**:
  ```bash
  docker-compose -f docker/docker-compose.yml up -d
  ```

4. **Directory Tests & Compilation:**
  ``bash
  npm run test
  npm run build
  ```
