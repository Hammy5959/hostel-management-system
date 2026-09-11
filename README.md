# Hostel Management System

A full-featured hostel/dormitory management system with two sides: a **staff back-office** for running day-to-day hostel operations, and a **resident self-service portal** where residents log in to view their own information and submit requests. Both are served by a single FastAPI backend and a single Next.js frontend.

Authorization is fully permission-based — every role (including "resident") is just a named bundle of granular permissions drawn from one shared catalog, so access is never hard-coded to a role name.

---

## What it does

### Staff back-office

- **Hostel structure** — manage buildings, floors, rooms, beds, and hostel-wide settings.
- **Admissions & residents** — resident profiles, admission applications (apply → approve/reject), room and bed allocation and transfers, check-in / check-out stays, resident documents, and emergency contacts.
- **Daily operations** — attendance marking, leave requests (apply → approve/reject), visitor registration with gate check-in/out logs, and gate passes (request → approve → issue → exit/return).
- **Finance** — fee structures, per-resident charges, invoices with line items, payments, expenses, and security deposits.
- **Maintenance & inventory** — resident complaints, maintenance tickets, inventory categories and items with stock adjustments, and assets with assignment tracking.
- **Mess & communication** — mess menus, meal marking and registers, notices with audience targeting by building/floor, and in-app notifications.
- **Administration** — user accounts, staff records, roles and a granular permission catalog, audit logs, and operational reports (occupancy, attendance, leave, and a dashboard summary).

### Resident portal

Residents log in separately and see only their own data and actions:

- View their own profile, room/allocation, attendance history, invoices, payments, charges, notices, and the mess menu.
- Self-service submission of leave requests, gate passes, complaints, and visitor registrations (view / create / cancel their own only — never any other resident's records).

Staff generate a resident's portal login directly from that resident's detail page via **Enable Portal Access**, with a full account lifecycle — activate, deactivate, and reset password — including automatic deactivation when the resident checks out.

---

## Tech stack

**Backend**

- Python 3.13+, FastAPI, served with Uvicorn
- Pydantic v2 (+ pydantic-settings) for schemas and configuration
- Supabase (PostgreSQL) as the database, accessed via `supabase-py` (PostgREST-based)
- Atomic business logic (checkout, bed allocation, leave transitions, payment recording, resident-portal account creation) runs as PostgreSQL functions invoked through Supabase RPC
- Authentication: password + email-OTP two-factor, with JWT session tokens (PyJWT) and Argon2id password hashing (argon2-cffi)
- Package manager: `uv`
- Tests: `pytest`

**Frontend**

- Next.js 16 (App Router, Turbopack) with React
- Tailwind CSS v4 with a Material Design 3–inspired custom color-token theme
- shadcn/ui components built on Base UI
- TanStack Query for data fetching, react-hook-form + zod for forms, lucide-react for icons
- Package manager: `pnpm`

**Auth flow:** login is password (factor 1) → OTP (factor 2) → JWT. In development the OTP is **not emailed** — it is printed to the backend's own terminal, so watch the backend console for the login code.

---

## Getting started

### Prerequisites

- Python 3.13 or newer, and [`uv`](https://docs.astral.sh/uv/)
- Node.js (LTS recommended) and [`pnpm`](https://pnpm.io/)
- An **existing, already-provisioned Supabase project**

> **Note on the database:** the `backend/supabase/migrations/` folder contains only incremental migrations — it does **not** include a base-schema migration that creates the core tables. The migrations alone cannot provision a brand-new empty project; the base schema must already exist in your Supabase project.

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd <repo-folder>
```

### 2. Set up the database

Run these in order:

1. In the **Supabase Dashboard → SQL Editor**, apply every file in `backend/supabase/migrations/` **in timestamp order** (e.g. `20260812000000_...` → `20260911000000_...`). They are idempotent (`CREATE OR REPLACE`), but later files depend on earlier ones, so order matters.
2. Run the seeder to populate roles, the permission catalog, and the initial super admin. From the `backend/` folder:

   ```bash
   uv run python -m app.seed.run
   ```

   This is safe to re-run — it only inserts what is missing.

### 3. Run the backend

From the `backend/` folder:

1. Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

   Environment variables used (fill in your own values — never commit secrets):

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `JWT_ALGORITHM` (default `HS256`)
   - `JWT_EXPIRATION` (seconds; default `5184000` = 60 days)
   - `OTP_LENGTH` (default `6`)
   - `OTP_EXPIRATION_SECONDS` (default `300`)
   - `OTP_MAX_ATTEMPTS` (default `5`)
   - `SUPER_ADMIN_EMAIL`
   - `SUPER_ADMIN_FIRST_NAME`
   - `SUPER_ADMIN_LAST_NAME`
   - `SUPER_ADMIN_PASSWORD`
   - `CORS_ORIGINS` (comma-separated; default `http://localhost:3000`)
   - `ENVIRONMENT` (default `development`)
   - `DEBUG` (default `true`)

2. Install dependencies and start the server:

   ```bash
   uv sync
   uv run python main.py
   ```

   The API runs at `http://localhost:8000`, with all routes under the `/api/v1` base path (e.g. `http://localhost:8000/api/v1/residents`).

### 4. Run the frontend

From the `frontend/` folder:

1. (Optional) Set the API URL. There is a single environment variable, `NEXT_PUBLIC_API_URL`, which defaults to `http://localhost:8000/api/v1` if unset. No Supabase keys are needed on the frontend — all file uploads relay through the backend.

2. Install dependencies and start the dev server:

   ```bash
   pnpm install
   pnpm dev
   ```

   The app runs at `http://localhost:3000`.

### 5. First login

Open `http://localhost:3000/login` and sign in with the `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` you configured (created by the seeder). After the password step, **watch the backend terminal** for the OTP banner — in development the one-time code is printed there, not sent by email. Enter it to complete login.
