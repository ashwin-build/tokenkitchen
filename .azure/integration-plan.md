# Integration hand-off

## Backend
- Project folder: `.`
- Run command: `npm run dev`
- Build command: `npm run build`
- Port: `3000`
- Health check: no dedicated `/api/health` route in the current app; verify runtime by booting `npm run dev` and probing the catalog routes below
- Database validation: `npm run db:generate` + `npm run db:deploy`
- Required env vars: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`

## Frontend
- Project folder: `.`
- Dev command: `npm run dev`
- Build command: `npm run build`
- API seam: root app uses Next.js route handlers and server actions; live-data wiring should be done at the app/server boundary, not in a separate Vite API client.
- Mock files to remove/rewrite if present: none in the current repo; there is no separate `src/api/` mock client or `previewState` switcher.
- App shell: Next.js app router under `src/app/` with dashboard pages in `src/app/dashboard/*`

## API routes
- `GET /api/catalog/ingredients` — exports ingredient CSV
- `GET /api/catalog/dishes` — exports dish CSV
- `GET /api/catalog/ingredients/template` — returns ingredient CSV template
- `GET /api/catalog/dishes/template` — returns dish CSV template
- Authentication/tenant enforcement is enforced by `currentCatalogMembership()` in `src/server/catalog/access.ts`

## Database
- Type: PostgreSQL via Prisma
- Migration tool: `prisma migrate`
- Migration directory: `prisma/migrations`
- Prisma schema: `prisma/schema.prisma`
- Connection env: `DATABASE_URL`
- Seed data: none for integration; do not add seed data during wiring unless explicitly requested by the user.

## Shared types
- Shared domain is defined in `prisma/schema.prisma` and generated Prisma client under `src/generated/prisma/*`
- No dedicated workspace package such as `@app/shared` exists yet; keep type usage aligned to the app-level Prisma types and server modules

## Services
- `src/server/auth/*` — Clerk membership/auth integration
- `src/server/catalog/*` — catalog access, CSV import/export, validation
- `src/server/db/*` — Prisma tenant-scope and subscription guard
- `src/server/system/*` — subscription/payment-event handling

### Service classification
- Essential: PostgreSQL, Clerk auth, tenant-scoped Prisma access, app runtime
- Enhancement: catalog import/export tooling, subscription billing plumbing, integration/webhook support

## Verification checklist
- Run `npm run typecheck`
- Run `npm test`
- Run `npm run test:integration` with PostgreSQL running
- Run `npm run build`
- Smoke-test the catalog API routes with valid tenant context and confirm they return expected CSV/template responses
