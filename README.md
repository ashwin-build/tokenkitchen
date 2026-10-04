# TokenKitchen

Multi-tenant restaurant operations SaaS. The current application includes the Phase 1 foundation, Phase 2 catalog, Phase 3 counter/order workflows, and Phase 4 inventory.

## Local setup

1. Copy `.env.example` to `.env` and add the Clerk publishable and secret keys from your Clerk application.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Install dependencies with `npm ci`.
4. Generate the Prisma client and apply the database migration with `npm run db:generate` and `npm run db:deploy`.
5. Seed subscription plans with `npm run db:seed`.
6. Start the app with `npm run dev` and open `http://localhost:3000`.

The local database maps to port `5433` to avoid colliding with an existing PostgreSQL service on `5432`.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration` (requires the local PostgreSQL database)
- `npm run build`

## Production deployment

Deploy the provided `Dockerfile` to a container platform with a managed PostgreSQL database. Run `npm run db:deploy` once against the production database before releasing the application, then configure the platform health probe to call `GET /api/health`.

Production startup deliberately refuses local URLs, Razorpay test credentials, or missing secrets. Set all of the following through the host's secret manager, never in source control: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`, `RAZORPAY_KEY_ID` (an `rzp_live_` key), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SELLER_NAME`, `SELLER_ADDRESS`, and `SELLER_GSTIN`.

Before enabling customer payments, configure the signed Razorpay webhook for `/api/webhooks/razorpay`, verify a live payment in a staging tenant, schedule encrypted database backups with a restore test, and confirm GST treatment with a qualified CA.

New accounts create a business workspace, owner membership, and 14-day trial. A Clerk user can belong to multiple businesses; the active business is selected from that user's memberships.

Plan prices are stored in paise. The seeded plans are ₹699 quarterly, ₹1,099 half-yearly, and ₹2,199 annually, with GST-inclusive pricing at 18% marked for CA review. Confirm the tax treatment with your CA before taking payments.

## Catalog

The signed-in workspace provides **Ingredients** and **Dishes**. Owners and Managers can edit; Cashiers can view and export. Ingredient opening quantities and imported stock adjustments are written as immutable stock movements; balances are updated by PostgreSQL triggers. Ingredients used in an active dish recipe must be removed from that recipe before archiving.

Ingredient CSV columns: `name,unit,currentQuantity,reorderLevel,costPerUnitPaise,active`.

Dish CSV columns: `name,pricePaise,gstRate,active,recipe`. Recipe cells use `ingredient:amount|ingredient:amount`. Download a template from the catalog import dialog. CSV uploads and pasted content are limited to 512 KB. Preview reports adds, updates, skipped rows, and row-level errors; confirmation recomputes the preview and applies the entire import in one transaction. Any invalid row or database write failure rolls back all changes.

CSV exports are UTF-8, quote cells, and prefix spreadsheet formula-leading values. Dish food cost is calculated from current ingredient cost and recipe quantity.

Production `npm start` requires both Clerk keys and exits before starting Next.js if either is missing. `npm run build` does not require production Clerk credentials.

## Counter and orders

The counter sends dish IDs, quantities, customer details, payment tenders, and a per-bill idempotency key. Server-side billing snapshots menu values, computes line GST in paise, allocates tenant/day token and tenant/FY invoice counters within the transaction, writes payment and customer balance entries, and deducts recipe stock through immutable movements. Enforce stock mode rejects shortages; Warn mode allows and flags them. Owners can change stock mode and whether listed prices include GST in Settings.

Orders begin in Preparing, then move to Ready and Completed. Owners and Managers can cancel with a reason; cancellations restore stock, reverse customer ledger debt, retain the invoice, and write audit events. Token slips support 58 mm and 80 mm layouts. Invoices are print-ready HTML with a browser Print / Save as PDF action; server-generated PDF binaries are not included, avoiding an unapproved PDF dependency.

## Inventory

Owners and Managers can record purchases with an existing or new supplier, ingredient quantities, unit costs, amount paid, and payment mode. Each purchase writes purchase lines, immutable stock movements, and the latest ingredient cost in one transaction; unpaid supplier balances create supplier ledger credit entries. An idempotency key prevents duplicate purchases on retry.

Wastage, spoilage, and stock-count adjustments require a reason and create movement rows. Stock counts record the difference from the current quantity. The inventory page and dashboard show active ingredients at or below their reorder level. The movement log filters by ingredient, movement type, and local date range, and exports through the safe UTF-8 CSV helper.

The Express licensing prototype remains in `server.js` and `license.js` for reference only; the Next.js app is the active application. `license-private.pem` is ignored and is not used by TokenKitchen. Rotate it if it has ever been committed or shared.
