# Railway deployment

This project deploys as one web service plus one managed PostgreSQL service. Railway detects the root `Dockerfile`; `railway.toml` runs database migrations before each release and requires `GET /api/health` to pass before the release becomes active.

## Create the services

1. Push this folder to a private GitHub repository. Do not commit `.env` or any credentials.
2. In Railway, create an empty project and add **PostgreSQL**. Leave the database private.
3. Add a GitHub service from the repository. Railway will use the checked-in Dockerfile.
4. Generate a public Railway domain temporarily and use its HTTPS URL for `NEXT_PUBLIC_APP_URL` until your custom domain is connected.

## Configure web-service variables

Create this reference variable in the web service. Replace `Postgres` if you use a different service name:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Add these sealed variables in Railway:

```text
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.example
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
SELLER_NAME=Your registered business name
SELLER_ADDRESS=Your registered business address
SELLER_GSTIN=Your GSTIN
```

## First release

1. Deploy the web service. Railway runs `npm run db:deploy` before starting the image.
2. Confirm the deployment becomes active only after `/api/health` returns HTTP 200.
3. Set the final HTTPS domain in Clerk's allowed origins and redirect URLs.
4. In Razorpay, create a webhook for `https://your-domain.example/api/webhooks/razorpay` and set its signing secret as `RAZORPAY_WEBHOOK_SECRET`.
5. Make a real payment in a staging tenant before accepting customer payments.

## Operations

- Keep PostgreSQL private; the app connects through Railway's internal `DATABASE_URL` reference.
- Enable Railway database backups and test a restore before launch.
- Configure a monthly usage alert and review logs and database capacity weekly during the first month.
- Railway config-as-code is scheduled for deprecation after 2026-12-01. Before then, migrate the `railway.toml` settings to Railway IaC or retain equivalent dashboard settings.
