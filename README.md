# ERP — Sales & Inventory

A small ERP covering the workflow a manufacturing and supply company runs when
it sells industrial products to business customers:

```
Customer Enquiry → Quotation → Sales Order → Inventory Reservation → Dispatch
```

Built as a Full-Stack Developer technical case study.

---

## Live

| | |
|---|---|
| **Frontend** | https://pern-erp-case-study.vercel.app |
| **API** | https://pern-erp-api.onrender.com |
| **Health check** | https://pern-erp-api.onrender.com/api/health |
| **Repository** | https://github.com/vicky3741/pern-erp-case-study |

> The API is on Render's free tier, which sleeps when idle. The first request
> after a quiet period can take up to a minute while it wakes up. Load the
> page once before a live demo and it stays fast after that.

### Test credentials

| Role | Email | Password | Can do |
|---|---|---|---|
| Admin | `admin@erp.local` | `Admin@123` | Everything Sales can, plus confirm sales orders (reserve stock), cancel orders, dispatch, and adjust inventory |
| Sales | `sales@erp.local` | `Sales@123` | Create customers, enquiries and quotations; send/accept/reject quotations; convert an accepted quotation to a sales order; read products, inventory and sales orders |

The login screen has one-click "Fill as Admin" / "Fill as Sales" buttons.

---

## The thing worth looking at first

Confirming a sales order — the point where inventory is actually reserved. The
brief calls this out directly as the important backend challenge: two people
confirming orders against the same stock at the same instant must not both
succeed.

```sql
SELECT "productId", "physicalQty", "reservedQty"
  FROM "inventory"
 WHERE "productId" = ANY($1)
 ORDER BY "productId"
   FOR UPDATE
```

This runs inside the confirmation transaction, before any check. The lock is
held until the transaction commits or rolls back, so a second confirmation
touching the same product **blocks at this SELECT** — before it has read
anything — and only proceeds once the first transaction is done. It then reads
the *new* reserved figure and correctly fails if there isn't enough left.

A read-check-write done in application code (read the stock, check it in
JavaScript, write the new reserved figure) cannot make this guarantee: two
concurrent requests can both read "70 available", both pass the check, and
both reserve — ending up with more reserved than physically exists.

Two things prove this holds:

```
80-unit and 50-unit reservations confirmed simultaneously against 100 available
  → exactly one succeeds, reserved lands on 80 or 50, never 130

ten 20-unit reservations confirmed simultaneously against 120 available
  → exactly six succeed, reserved lands on exactly 120, never above
```

Run it yourself:

```bash
cd backend && npm test -- bonus-concurrent-reservation
```

`docs/ARCHITECTURE.md`-equivalent reasoning is inline as comments in
[`backend/src/modules/inventory/reservation.ts`](backend/src/modules/inventory/reservation.ts).

---

## Tech stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL |
| ORM | Prisma |
| API | Node.js + Express 4 + TypeScript |
| Validation | Zod |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Tests | Vitest + Supertest |
| Frontend | React 19 + Vite + TypeScript |
| Data fetching | TanStack Query + axios |
| Styling | Tailwind CSS |
| Deployment | Render (API + Postgres) + Vercel (frontend) |

---

## Project setup

### Prerequisites

- Node.js ≥ 20
- A PostgreSQL database (local, or a free one from [Neon](https://neon.tech) — this project's own live deployment uses Neon)

### Install

```bash
git clone https://github.com/vicky3741/pern-erp-case-study.git
cd pern-erp-case-study
npm run install:all
```

### Database setup

Create two databases — one for the app, one for the automated test suite
(the tests truncate every table between files, so this must never be the
same database you develop against):

```sql
CREATE DATABASE pern_erp;
CREATE DATABASE pern_erp_test;
```

### Environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`backend/.env`:

| Variable | Purpose | Example |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `PORT` | API port | `4000` |
| `DATABASE_URL` | App's Postgres connection string. **Use the direct endpoint, not a transaction pooler** — reservation holds `SELECT … FOR UPDATE` locks across several statements in one transaction, which a pooler in transaction mode cannot support, and it cannot run migrations at all | `postgresql://user:pass@host:5432/pern_erp` |
| `TEST_DATABASE_URL` | Separate database for `npm test`, which truncates every table between test files | `postgresql://user:pass@host:5432/pern_erp_test` |
| `JWT_SECRET` | Signs auth tokens, minimum 16 characters | generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins | `http://localhost:5173` |
| `BCRYPT_SALT_ROUNDS` | Password hashing cost | `10` |

`frontend/.env`:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Leave **empty** for local dev (Vite proxies `/api` to `localhost:4000`, so there's no CORS to configure). Set to the deployed backend origin in production. |

### Migrate and seed

```bash
npm run db:migrate   # applies every migration, including the CHECK constraints
npm run db:seed      # 2 users, 6 industrial products with inventory, 3 customers
```

`npm run db:reset` truncates every table and re-seeds — useful for putting the
database back to a clean state after exploring the app or running the smoke
script.

### Run it

```bash
npm run dev
```

Backend on `http://localhost:4000`, frontend on `http://localhost:5173`.

---

## Running the tests

### Automated suite (mandatory, 5 tests + bonus)

```bash
cd backend
npm test
```

Runs against `TEST_DATABASE_URL`, truncating and rebuilding fixtures between
files. Takes a few minutes — several tests deliberately fire concurrent
requests and wait for real Postgres row locks to resolve, which is the whole
point of the test.

| File | Covers |
|---|---|
| `tests/test-1-quotation-total.test.ts` | Quotation total is calculated correctly |
| `tests/test-2-quotation-status-guard.test.ts` | Rejected/Draft quotation cannot create a sales order |
| `tests/test-3-duplicate-sales-order.test.ts` | Same quotation cannot generate duplicate sales orders |
| `tests/test-4-inventory-reservation.test.ts` | Cannot reserve more than available inventory |
| `tests/test-5-authorization.test.ts` | Unauthorized user cannot perform a restricted operation |
| `tests/bonus-concurrent-reservation.test.ts` | Simultaneous reservations (bonus) |

### Smoke test (manual, against a running server)

```bash
npm run dev            # in one terminal
npm run test:smoke     # in another
```

Exercises the real API over HTTP against the development database — 143 checks
covering the full workflow plus every validation and role-guard branch. Not a
substitute for `npm test`; useful for a quick sanity check before a demo. Run
`npm run db:reset` afterward if you want the database looking freshly seeded
again — the smoke test creates throwaway documents and products as it runs.

---

## How the business rules are enforced

Four things worth reading the code for, each a place where the obvious
implementation is wrong and the actual one is not much more code:

**1. The server computes every quotation amount; nothing from the client is trusted.**
`backend/src/modules/quotations/quotation.schema.ts` does not declare
`lineAmount`, `subTotal` or `grandTotal` as accepted fields. Zod strips
unknown keys and `validate()` replaces `req.body` with the parsed result, so a
client-sent total is discarded before any service code runs — not by
convention, but because the field is structurally unreachable. See
`backend/src/modules/quotations/pricing.ts` for the calculation itself, done
in `Prisma.Decimal` rather than floats.

**2. One quotation cannot produce two sales orders — enforced by the database, not the request handler.**
`sales_orders.quotationId` carries a `UNIQUE` constraint
(`backend/prisma/schema.prisma`). The service checks for an existing order
first, but that check is a race two simultaneous requests can both pass — the
constraint is what actually makes duplication impossible: the second `INSERT`
fails with Prisma error `P2002`, caught and turned into the same clean 409.
See `convertQuotation` in
`backend/src/modules/sales-orders/salesOrder.service.ts`.

**3. Reservation uses `SELECT … FOR UPDATE`, not read-check-write.**
See `lockInventoryRows` in
`backend/src/modules/inventory/reservation.ts` and the walkthrough at the top
of this README.

**4. Inventory CHECK constraints make negative or over-reserved stock unrepresentable.**
`backend/prisma/migrations/20260916140554_inventory_check_constraints/migration.sql`
adds `physical_qty >= 0`, `reserved_qty >= 0`, and — the one that matters most —
`reserved_qty <= physical_qty`. Application code already prevents these states;
the constraints are the backstop, so the worst case for a bug in that code is a
failed transaction, never corrupted stock.

---

## Database schema

See [docs/ER-DIAGRAM.md](docs/ER-DIAGRAM.md) for the full entity-relationship
diagram and the reasoning behind each table.

## API documentation

See [docs/API.md](docs/API.md) for every endpoint, or import
[`postman/ERP-Sales-Inventory.postman_collection.json`](postman/ERP-Sales-Inventory.postman_collection.json)
into Postman — it walks the entire happy path (login → customer → enquiry →
quotation → accept → convert → confirm → dispatch) with chained variables,
plus the failure cases (converting a draft, double conversion, over-reserving,
a sales user hitting an admin route).

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Assumptions and design choices

See [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) for the calls made where the
brief allows discretion — schema layout, API shape, what counts as a
"restricted operation," and so on.
