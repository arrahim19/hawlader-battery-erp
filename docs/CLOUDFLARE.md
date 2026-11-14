# Cloudflare Free hosting

Frontend: https://hawlader-battery-erp.ar-rahim-41b.workers.dev

The frontend is a static Next.js export served by Cloudflare Workers Static Assets.
Only /api/* requests invoke the lightweight Worker proxy. The Node/NestJS API
runs separately on Render Free and uses the existing Neon PostgreSQL database.
No Docker, paid Containers, or Workers Paid subscription is required for this path.
Free quotas still apply. Render sleeps after 15 idle minutes and can take about
a minute to wake. This is a free starting setup, not a promise of production uptime.

## What is live

The frontend and API are live, with the Worker proxy connected to
https://hawlader-battery-api.onrender.com. The API runs on Render Free in Singapore
and connects to the existing Neon database. No paid subscription was enabled.
The static pages do not contain business records or credentials. Session
permissions and all business writes are enforced by the API.

Live verification passed for login, session persistence after refresh, inventory,
the three fixed product categories, purchase/sales options, secure session cookies,
and logout. Direct backend requests without the proxy secret are rejected.
Verification did not create or modify business records; purchase and sales writes
were covered by the separate isolated integration tests.

## Connect the API

The current service is already configured. To recreate this setup:

1. Create a Blueprint using render.yaml from the GitHub repository.
2. Select Free. The file explicitly uses the native Node runtime, Singapore,
   a database-backed health check, and port binding on 0.0.0.0.
3. Set DATABASE_URL to the existing Neon connection URL with SSL enabled. Keep
   the database in Neon; do not create Render's temporary free database.
4. Set API_PROXY_SECRET to the value in the ignored root .env.cloudflare file.
   This shared secret must match the Worker. The Blueprint generates CSRF_SECRET
   once; the current service uses the existing stable secret. Keep it stable to
   preserve sessions. APP_ORIGIN is already the Cloudflare URL.
5. Deploy the service and get its HTTPS onrender.com address. Its direct health
   endpoint should return JSON success. Other API paths reject requests that do
   not contain the proxy secret, even if a forwarded IP header is supplied.
6. From the repository root, run:

~~~powershell
npm run cf:secrets -- https://YOUR-API.onrender.com
~~~

The secrets command sends only API_URL and API_PROXY_SECRET to the free Worker,
over stdin. DATABASE_URL and CSRF_SECRET remain on Render. It reads the shared
secret from .env.cloudflare, which is ignored by Git and excluded from Docker.
Never paste these secrets into chat or commit them to the repository.

Existing database migrations are applied separately with npm run db:migrate,
from a trusted environment. Service startup does not reset data, create users,
or apply migrations automatically. Existing owner credentials continue to work.

## Develop, build, and publish

~~~powershell
npm ci
npm run cf:test
npm run typecheck
npm run cf:build
npm run cf:login
npm run cf:deploy
~~~

Use npm run dev for ordinary local Next.js/API development. To test the exported
frontend with the Cloudflare asset router, build it and run:

~~~powershell
npm run dev --workspace @hawlader/cloudflare
~~~

Static export routes are generated from the shared workspace menu. Customer IDs
and preview module/view parameters are read in client components inside Suspense
boundaries, so saved-customer sales and preview links still work. Unknown routes
return 404. Legacy product/inventory entry links redirect to /inventory.

The free config is apps/cloudflare/wrangler.free.jsonc. The previous optional
paid Container configuration is retained separately as wrangler.jsonc and is
not used by cf:deploy. Do not enable that alternative for a free deployment.

## Future deployment from GitHub

The manual .github/workflows/cloudflare.yml workflow builds static pages and
publishes to Cloudflare Free. It does not use Docker or provision a paid plan.
Create the GitHub production environment with:

- Secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, API_PROXY_SECRET.
- Variables: API_URL (Render HTTPS origin), ERP_ORIGIN (the frontend HTTPS origin).

Use a Cloudflare deployment token scoped to this account's Workers scripts and
static assets. The account ID is 41b2175b95eeb040ec1b4da3c20c8085. Never add the
Neon connection URL to the frontend build. Run Deploy ERP frontend to Cloudflare
Free from GitHub Actions when a release is ready.

## Verify the complete deployment

Check /login and /api/v1/health on the Cloudflare address. Sign in, refresh a
protected page, and verify logout, staff permissions, category filtering, customer
selection, purchase receiving, and sales posting with controlled records. A hosted
login page alone does not prove that the backend works. The Worker never
retries a business write automatically after a timeout or connection error.

References:
[Cloudflare static assets](https://developers.cloudflare.com/workers/static-assets/),
[Render Free limits](https://render.com/docs/free),
[Neon plans](https://neon.com/pricing).
