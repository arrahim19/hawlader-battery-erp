# Cloudflare deployment

This deployment runs the existing Next.js UI and NestJS API inside one Linux
Container. The Worker exposes HTTPS, forwards requests to Next.js on port 8080,
and keeps the API on private loopback port 3001. Next.js rewrites `/api/v1/*` to
the API, so login cookies and CSRF remain on the same public origin. All business
data and sessions stay in Neon PostgreSQL; container disk is disposable.

## Required account setup

- Enable the Workers Paid plan. Containers consume additional CPU, memory and
  disk usage beyond the plan's included allowance; $5 is not a fixed total bill.
- Use the existing migrated Neon database. Run `npm run db:migrate` from a trusted
  machine before deploying a version with new migrations. The image does not
  embed database credentials, bootstrap users, or migrate automatically.
- Pick one HTTPS address, such as
  `https://hawlader-battery-erp.YOUR-SUBDOMAIN.workers.dev`.
  Find the Workers subdomain in the Cloudflare dashboard. This exact origin is
  needed for authentication. Other hostnames redirect safe reads; writes to an
  alternate hostname are rejected.

The Worker routes everyone to the same named Container. It sleeps after ten
minutes of inactivity. Its next request may take longer while Node and Neon
start. PostgreSQL records survive sleep and image updates.

## Deploy from this computer

Install Docker Desktop with Linux containers and start it, then run from the
repository root:

```powershell
npm ci
docker info
npm run cf:login
npm run typecheck
npm run build
npm run cf:deploy
npm run cf:secrets -- https://hawlader-battery-erp.YOUR-SUBDOMAIN.workers.dev
```

The first deployment returns 503 until its three runtime secrets are set. The
secrets command reads `DATABASE_URL` and `CSRF_SECRET` from the ignored root `.env`
or process environment and sends only those plus `APP_ORIGIN` over stdin to
Cloudflare. It never uploads `.env` or the direct migration URL. Keep the CSRF
secret stable across deployments; changing it invalidates existing sessions.
No credentials should be pasted into chat, Docker build arguments, or Git files.

The Cloudflare config is `apps/cloudflare/wrangler.jsonc`. The Docker build context
is the repository root, not `apps/web`. The container uses Linux-native `argon2`
and Prisma dependencies generated during its Linux build.

## Deploy without Docker on this computer

The manually triggered GitHub workflow `.github/workflows/cloudflare.yml` builds
the image on GitHub's Linux runner and deploys through Wrangler.

1. Push the source to your GitHub repository.
2. Create the GitHub environment `production`.
3. Under that environment's **Secrets**, add:
   - `CLOUDFLARE_API_TOKEN`: an account-scoped deployment token with the Worker,
     Durable Object, Containers/Cloudchamber, and managed image registry access
     required by Wrangler. Scope it to the intended Cloudflare account. Do not
     use a Global API Key. Check Wrangler's permission error if a required scope
     is missing rather than granting all account access.
   - `CLOUDFLARE_ACCOUNT_ID`: the target account ID.
   - `DATABASE_URL`: the pooled Neon connection URL with SSL enabled.
   - `CSRF_SECRET`: a persistent random string of at least 32 characters.
4. Under **Variables**, add `ERP_ORIGIN` with the full HTTPS origin.
5. Open **Actions → Deploy ERP to Cloudflare → Run workflow**.

The workflow is manual; pushing code alone does not publish a new ERP version.
It builds and checks before deployment, uploads runtime secrets, and checks the
database health endpoint and login page. A failed health check is a failed
deployment verification, even if Cloudflare accepted the image.

## Verify before using real transactions

Open `/api/v1/health` and `/login` on the configured address. Sign in with an
existing owner account, then verify category filters, purchase receiving, sales,
and stock changes using controlled records. Confirm staff permissions as well.
Do not repeatedly submit a purchase or sale if a request times out; check its
saved status first. The Worker does not automatically retry business requests.

To add a custom domain later, configure its Worker custom domain in Cloudflare,
update `APP_ORIGIN` through the secrets command (or `ERP_ORIGIN` in GitHub), and
allow the running container to restart before using the new address. Runtime
secret changes apply when a container next starts, not inside a running process.

## Current verification limits

A successful TypeScript check, app build, and Worker dry run do not verify a Linux
container image or live Cloudflare deployment. Docker or the GitHub workflow must
complete its build and live checks before the ERP is considered hosted.

References: [Containers setup](https://developers.cloudflare.com/containers/get-started/),
[runtime secrets](https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/),
[Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/).
