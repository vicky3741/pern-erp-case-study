# ERP — Sales & Inventory

A small ERP covering the workflow a manufacturing and supply company runs when
it sells industrial products to business customers:

```
Customer Enquiry → Quotation → Sales Order → Inventory Reservation → Dispatch
```

Built as a Full-Stack Developer technical case study.

> **Status:** scaffold. The full README — setup, environment variables,
> migrations, seeding, test credentials and how to run everything — is written
> once the modules are in place.

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

---

## Running it

```bash
npm run install:all
cp backend/.env.example backend/.env    # then fill in DATABASE_URL and JWT_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

Backend on `http://localhost:4000`, frontend on `http://localhost:5173`.
The Vite dev server proxies `/api` to the backend, so there is no CORS in
development.

```bash
npm test          # backend test suite
npm run typecheck # both workspaces
```
