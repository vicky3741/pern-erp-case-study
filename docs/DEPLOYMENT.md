# Deployment

The API and its database deploy to Render; the frontend deploys to Vercel.
`render.yaml` at the repo root already describes the API service, so Render
can read it directly rather than being configured by hand.

> Live URLs are recorded in the main [README](../README.md) once deployed.

## 1. Database

Any PostgreSQL host works, as long as the connection string is a **direct**
endpoint, not a transaction pooler — reservation holds row locks across
several statements inside one transaction, and migrations cannot run through
a pooler at all. This project's own instance uses
[Neon](https://neon.tech) (free tier, no time limit, unlike Render's free
Postgres which is deleted after 30 days).

1. Create a Neon project and copy the connection string.
2. If the hostname contains `-pooler`, remove that segment — that is the
   pooled endpoint.
3. Create two databases if you haven't already: the app's own, and
   `_test` for the automated suite (the suite truncates every table, so it
   must never share a database with real data).

## 2. API — Render

1. **Dashboard → New → Blueprint**, point it at this repository. Render reads
   `render.yaml` and proposes the `pern-erp-api` web service.
2. Set the secret environment variables Render does not read from the
   blueprint (`render.yaml` marks these `sync: false`):
   - `DATABASE_URL` — the direct Neon connection string
   - `JWT_SECRET` — a long random string, generated the same way as local dev
   - `CORS_ORIGINS` — the Vercel frontend's origin, **no trailing slash**
     (added after step 3, then this service redeployed)
3. Deploy. The build runs `npm ci --include=dev && npx prisma generate && npm run build` and the start command runs `npx prisma migrate deploy && node dist/server.js` — migrations apply automatically on every boot, and re-running them is a no-op once they've been applied.
4. Seed the production database once, from your own machine, pointed at the
   production `DATABASE_URL`:
   ```bash
   cd backend
   DATABASE_URL="<production connection string>" npm run seed
   ```
5. Confirm `<render-url>/api/health` returns `{ "success": true, "data": { "status": "ok", "database": "up" } }`.

## 3. Frontend — Vercel

1. **Import Project**, point it at this repository, set the root directory to
   `frontend`.
2. Environment variable: `VITE_API_URL` = the Render API's origin (no
   trailing slash, no `/api` suffix — the frontend appends that itself).
3. Deploy. `frontend/vercel.json` already sets the SPA rewrite (every path
   serves `index.html`) and static asset caching headers.
4. Go back to Render and set `CORS_ORIGINS` to this Vercel URL, then trigger a
   redeploy of the API — without this, the browser's CORS preflight fails and
   every request from the deployed frontend is blocked.

## 4. Verify

1. Open the Vercel URL, sign in as `admin@erp.local`.
2. Walk the workflow once: enquiry → quotation → accept → convert → confirm →
   dispatch.
3. Update the **Live** table at the top of the main README with both URLs.

## Notes

- Free-tier Render services sleep after inactivity; the first request after a
  quiet period can take up to a minute while it wakes. The health check
  endpoint is what Render itself polls to decide the service is up.
- `BCRYPT_SALT_ROUNDS` and `JWT_EXPIRES_IN` have sane defaults in
  `render.yaml` (`10` and `7d`) — no need to set them unless you want
  different values.
