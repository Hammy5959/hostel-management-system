# Hostel Management System — Backend

Production-oriented **Student Hostel Management System** backend built with
**FastAPI**, **Pydantic v2**, **JWT** and **Supabase (PostgreSQL)**.

**Password + OTP** authentication → **JWT** → **User → Role → Permissions →
API access**. Passwords are stored only as **Argon2id** hashes; the backend is
the single authority for authorization; the frontend never controls it.

> **Backend only.** This repository contains no frontend code.

---

## Table of contents

- [Stack](#stack)
- [Project structure](#project-structure)
- [One-time database setup](#one-time-database-setup)
- [Environment variables](#environment-variables)
- [Installation & running](#installation--running)
- [Authentication flow](#authentication-flow)
- [Authorization / RBAC](#authorization--rbac)
- [Seeding roles & permissions](#seeding-roles--permissions)
- [Testing](#testing)
- [API overview](#api-overview)
- [Database architecture](#database-architecture)
- [Transactions & concurrency](#transactions--concurrency)

---

## Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Language   | Python 3.13                             |
| Framework  | FastAPI, Uvicorn                        |
| Validation | Pydantic v2                             |
| Auth       | OTP (in-memory) + JWT (PyJWT)           |
| Database   | Supabase (PostgreSQL) via PostgREST     |
| Money      | `Decimal` / `NUMERIC` (never float)     |
| Tests      | pytest                                  |

---

## Project structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app: CORS, error handlers, /health
│   ├── api/                    # versioned router aggregation, shared deps
│   ├── core/                   # config, security (JWT), permissions, exceptions, logging
│   ├── database/               # Supabase client + shared CRUD/RPC helpers
│   ├── auth/                   # OTP store, sender, request/verify endpoints
│   ├── seed/                   # roles + permission catalog + idempotent seeder
│   └── <feature modules>/      # routes / schemas / service per domain
│       e.g. residents/, admissions/, allocations/, stays/, finance/, ...
├── supabase/migrations/        # SQL to apply once via the Supabase dashboard
├── tests/                      # pytest unit + gated integration tests
├── .env.example
├── pyproject.toml
└── README.md
```

Every feature module keeps a clear separation:
- `schemas.py` — Pydantic v2 request/response models
- `service.py` — business logic + authorization
- `routes.py` — FastAPI endpoints (thin, delegate to service)

---

## One-time database setup

The 39 Supabase tables already exist and are **final** — the backend does not
create or alter tables. Two one-time SQL steps are required:

### 1. Restore service-role grants

The tables were created without the standard Supabase grants, so the backend's
`service_role` role lacks SELECT/INSERT/UPDATE/DELETE. Apply:

`supabase/migrations/20260812000000_restore_service_role_grants.sql`

in the **Supabase Dashboard → SQL Editor**. (Safe/idempotent. RLS stays enabled.)

### 2. Create the RPC functions

Transaction-critical flows (bed allocation, transfer, check-in/out, payment,
report sums) run as database functions so they are atomic and concurrency-safe.
Apply:

- `supabase/migrations/20260812000010_allocation_stay_functions.sql`
- `supabase/migrations/20260812000020_finance_functions.sql`
- `supabase/migrations/20260812000030_reports_functions.sql`

### 3. Seed roles & permissions

```bash
uv run python -m app.seed.run
```

Idempotent — safe to re-run; never duplicates rows. `super_admin` receives
every permission automatically. The seeder also **creates the initial
Super Admin account** (configurable via `SUPER_ADMIN_EMAIL`, default
`hamid59@gmail.com`, initial password `SUPER_ADMIN_PASSWORD`, default
`***REMOVED***`) — created as `invited`, activated on first OTP login. Only the
**Argon2id hash** of the password is stored, and it is only set when the
account has none yet (re-runs never reset a changed password). If the email
already exists with a different role it is promoted.

---

## Environment variables

Copy `.env.example` → `.env` and fill in real values. Secrets are never
committed (`.env` is git-ignored).

| Variable                    | Required | Notes                                          |
|-----------------------------|----------|------------------------------------------------|
| `SUPABASE_URL`              | yes      | Project URL                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | yes      | Backend-only secret key. (Also accepts `SUPABASE_SERVICE_KEY`.) |
| `JWT_SECRET`                | yes      | Long random string (≥32 bytes).                |
| `JWT_ALGORITHM`             | no       | default `HS256`                                |
| `JWT_EXPIRATION`            | no       | seconds, default 3600                          |
| `OTP_LENGTH`                | no       | default 6                                      |
| `OTP_EXPIRATION_SECONDS`    | no       | default 300                                    |
| `OTP_MAX_ATTEMPTS`          | no       | default 5                                      |
| `CORS_ORIGINS`              | no       | comma-separated origins, default `http://localhost:3000` |
| `ENVIRONMENT` / `DEBUG`     | no       | runtime metadata                               |

Generate a JWT secret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Installation & running

Requires Python 3.13 and [uv](https://docs.astral.sh/uv/).

```bash
cd backend
uv sync                     # install dependencies
cp .env.example .env        # then fill in real values
uv run uvicorn app.main:app --reload
# or: python main.py
```

- Interactive API docs: http://localhost:8000/docs
- OpenAPI schema: http://localhost:8000/openapi.json
- Health: http://localhost:8000/health

---

## Authentication flow

Two factors: **password** (Argon2id) then **OTP**. One shared login for staff
and residents. A JWT is only issued after BOTH factors succeed.

```
POST /api/v1/auth/request-otp   { "email": "user@example.com", "password": "..." }
        │  validate account exists + active
        │  verify password against its Argon2id hash  (factor 1)
        │  generate 6-digit OTP (in-memory, never in PostgreSQL)
        │  print to terminal (development sender)
        ▼
POST /api/v1/auth/verify-otp    { "email": "...", "otp": "123456" }
        │  validate OTP, expiry, attempt limit          (factor 2)
        │  mark user active + email_verified + last_login_at
        ▼
{ "access_token": "<jwt>", "expires_in": 3600, "user": { ... } }
```

- Send the JWT as `Authorization: Bearer <token>`.
- **Passwords** are validated (≥8 chars, ≥1 number, ≥1 special character),
  hashed with Argon2id, and only the hash is stored in `users.password_hash`.
  They are never stored, logged, or returned in API responses.
- **OTPs** expire after `OTP_EXPIRATION_SECONDS`, are limited to
  `OTP_MAX_ATTEMPTS`, and are **never** returned by the API or stored in the
  database.
- The delivery channel is pluggable: `app/auth/otp.py` defines an `OTPSender`
  interface; the `TerminalSender` prints to the terminal for development and
  can be swapped for email/SMS without changing the auth API contract.

---

## Authorization / RBAC

Authorization is permission-based, never hard-coded role checks:

```
User → Role → role_permissions → Permissions → API access
```

- `require_permission("residents.view")` — dependency requiring **all** listed
  permissions.
- `require_any_permission(...)` — requires **at least one**.
- **Super Admin** bypasses every check automatically.
- Resident ownership is enforced in services: a resident can only ever reach
  records linked to their own `user_id` (changing an ID yields `403`).

Role catalogue and permission maps live in `app/seed/catalog.py`.

---

## Seeding roles & permissions

```bash
uv run python -m app.seed.run
```

Seeds: 10 system roles, the full permission catalog, and role→permission
grants. Running it repeatedly is a no-op.

---

## Testing

```bash
# Unit tests (no database required)
uv run pytest -q

# Integration tests (after DB setup above):
# creates its own records, tests auth/RBAC/allocation/stay/finance, cleans up.
HMS_RUN_INTEGRATION=1 uv run pytest tests/test_integration.py -v
```

---

## API overview

All endpoints are versioned under `/api/v1`:

| Module | Base path |
|--------|-----------|
| Auth | `/auth` |
| Users / staff / roles / permissions | `/users`, `/staff`, `/roles`, `/permissions` |
| Hostel structure | `/hostel-settings`, `/buildings`, `/floors`, `/rooms`, `/beds` |
| Residents | `/residents`, `/resident-documents`, `/emergency-contacts` |
| Admissions / allocation / stays | `/admissions`, `/room-allocations`, `/resident-stays` |
| Daily operations | `/attendance`, `/leave-requests`, `/visitors`, `/visitor-logs`, `/gate-passes` |
| Finance | `/fee-structures`, `/resident-charges`, `/invoices`, `/payments`, `/expenses`, `/security-deposits` |
| Maintenance & inventory | `/complaints`, `/maintenance-tickets`, `/inventory-categories`, `/inventory-items`, `/assets`, `/asset-assignments` |
| Mess & communication | `/mess-menus`, `/meals`, `/notices`, `/notifications` |
| Audit & reports | `/audit-logs`, `/reports/*` |

List endpoints support **pagination, search, filtering, sorting and date
ranges** — all filtering happens in the database (PostgREST), never in Python.

---

## Database architecture

The 39-table schema (already live in Supabase) is the source of truth. Key
hierarchies and status enums are documented in the seed catalog and the
migration files. All tables have RLS **enabled**; the backend talks to the
database through the service-role key, so application-level RBAC is the
enforcement layer and RLS remains defense-in-depth.

Money is stored as `NUMERIC` and handled as `Decimal` end-to-end. Invoice
totals are computed server-side from line items.

---

## Transactions & concurrency

A bed is a shared resource — two admins must not allocate it simultaneously.
Critical flows therefore run as **database functions** that lock rows with
`SELECT ... FOR UPDATE` inside a single transaction:

| Operation | Function |
|-----------|----------|
| Bed allocation | `hms_allocate_bed` |
| Allocation transfer | `hms_transfer_allocation` |
| Allocation release | `hms_release_allocation` |
| Check-in / check-out | `hms_check_in` / `hms_check_out` |
| Payment + invoice balance | `hms_record_payment` |
| Report sums | `hms_sum_payments`, `hms_sum_expenses`, `hms_outstanding_balance` |

These run `SECURITY DEFINER` with `search_path` pinned to `public`; the backend
calls them via `client.rpc()`. Domain errors raised by the functions
(`bed_occupied`, `payment_exceeds_balance`, ...) map to clean HTTP errors.
