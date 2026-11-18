# Local development

This guide runs the Phase 2 foundation. It does not enable unimplemented purchasing, sales, replacement, or reporting workflows. All commands are run from the project root unless stated otherwise.

## Prerequisites and install

- Node.js 26.x LTS and npm. The runtime upgrade is verified with Node 26.13.1. `.nvmrc`, `.node-version`, and the root and application manifests select Node 26.
- PostgreSQL 18 client/server tools for the isolated local helper, or a separate reachable PostgreSQL database.
- Ports 3000 and 3001 for frontend/API; port 55432 for the optional project-owned database.

```powershell
Set-Location 'F:\Web Calculator\Hawlader Battery ERP'
npm ci
npm run setup
```

`npm ci` uses the committed lockfile and runs Prisma Client generation. `npm install` is also available when deliberately changing dependencies; commit the resulting lockfile. No global Next.js, NestJS, Prisma, or TypeScript installation is required.

`setup` creates `.env` from `.env.example` with a random database password and CSRF secret. It never overwrites an existing `.env`. It does not connect to a database. Do not commit `.env`, database files, sessions, or the generated owner credentials.

## Database option A — isolated project-local PostgreSQL

This computer has PostgreSQL 18 in `C:/Program Files/PostgreSQL/18/bin`. The helper uses those binaries to initialize a **separate** cluster inside `.local/postgres`, with SCRAM password authentication, loopback-only listening and port 55432. It leaves the pre-existing system PostgreSQL service untouched.

```powershell
npm run db:local
npm run db:migrate
npm run db:admin
```

For another tools installation, set the binary directory before starting:

```powershell
$env:PG_BIN_DIR = 'D:/PostgreSQL/18/bin'
npm run db:local
```

On Linux, set `PG_BIN_DIR` to your installed PostgreSQL bin directory; the helper defaults to `/usr/lib/postgresql/18/bin`. `initdb` must run as a normal operating-system user, not root. Other platforms can use manual setup below.

The helper only manages URLs for `127.0.0.1:55432/hawlader_erp`; it refuses remote URLs, a different database, or production mode. Repeated starts preserve the cluster. Passwords are passed to initdb through a temporary ignored password file and removed after initialization; server output goes to `.local/postgres.log`.

```powershell
npm run db:stop
```

Stopping preserves data. Do not delete `.local/postgres` as a troubleshooting shortcut. If port 55432 is occupied by another program, stop that program yourself or use a separate database and configuration; the helper will not repurpose the existing service.

## Database option B — your own PostgreSQL

Create a new development database and login using your PostgreSQL administrator, without modifying existing databases. For a new installation, the following SQL is a template, not an instruction to replace existing roles:

```sql
CREATE ROLE hawlader_dev LOGIN PASSWORD 'choose-a-strong-development-password';
CREATE DATABASE hawlader_erp OWNER hawlader_dev;
```

Set `DATABASE_URL` in the ignored root `.env` to the corresponding connection string. Percent-encode special characters in the password:

```dotenv
DATABASE_URL=postgresql://hawlader_dev:YOUR_ENCODED_PASSWORD@127.0.0.1:5432/hawlader_erp?schema=public
```

Then run:

```powershell
npm run db:generate
npm run db:migrate
npm run db:admin
```

Do not run `db:local` for an external/manual database. `db:migrate` runs Prisma **migrate deploy** against committed migrations; it does not reset a database or use `db push`. For production, use separate least-privilege application and migration roles; the owner-level local role is not a production access design.

If you already run PostgreSQL in Docker, create a fresh development database there and use this same manual URL process. Docker is not required by this project.

## Database option C — Neon PostgreSQL

In the Neon project, open **Connect** and select the intended branch, database,
and role. Copy the connection string with **Connection pooling** enabled into
`DATABASE_URL` in the root `.env`. Turn pooling off and copy the direct URL into
`DATABASE_URL_UNPOOLED`. Both URLs must target the same branch and database.
Copy only the URL, without a `psql` command or surrounding shell quotes. Preserve
the TLS parameters provided by Neon. These credentials belong only in `.env`;
never put them in frontend code or `NEXT_PUBLIC_*` variables.

```dotenv
DATABASE_URL=postgresql://ROLE:PASSWORD@ep-EXAMPLE-pooler.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require
DATABASE_URL_UNPOOLED=postgresql://ROLE:PASSWORD@ep-EXAMPLE.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

For a **fresh, empty Neon database**, run:

```powershell
npm.cmd run db:validate
npm.cmd run db:migrate
npm.cmd run db:admin
npm.cmd run dev
```

Use `npm.cmd` if PowerShell blocks `npm.ps1`. The application uses the pooled URL;
Prisma CLI uses the direct URL when set, falling back to `DATABASE_URL` otherwise.
The API allows 30 seconds to establish a connection so suspended Neon compute
has time to wake. Restart existing API/web servers after editing `.env`.
Check `http://localhost:3001/api/v1/health`, then log in and open the dashboard.

Changing the URLs does **not** copy local records. To preserve existing records,
keep the local connection details and take a PostgreSQL backup before switching.
Restore into an empty Neon database using a direct connection, verify the restored
records and migration history, then switch the application's URLs. Do not run
fresh-database bootstrap or migrations before restoring a full schema/data backup.
Keep existing `.local/admin-credentials.txt`: a new database with a new owner
password needs its own credentials file, while a restored owner keeps its password.

Do not run `db:local`/`db:stop` with Neon URLs. Integration tests require a separate
`TEST_DATABASE_URL` whose database name ends in `_test`; the runner overrides both
application and migration URLs to that isolated database.

See [Neon's Prisma guide](https://neon.com/docs/guides/prisma) and
[connection pooling documentation](https://neon.com/docs/connect/connection-pooling).

## Environment variables

| Variable | Purpose / default |
| --- | --- |
| `NODE_ENV` | `development`; production enables Secure host-prefixed cookies and requires HTTPS |
| `APP_ORIGIN` | Allowed browser write Origin; default `http://localhost:3000` |
| `API_PORT` | NestJS port; default 3001 |
| `INTERNAL_API_URL` | Next.js server-side API proxy target; default `http://127.0.0.1:3001` |
| `DATABASE_URL` | PostgreSQL application URL; also used by migrations if no direct URL is set |
| `DATABASE_URL_UNPOOLED` | Optional direct PostgreSQL URL for Prisma CLI/migrations (Neon) |
| `CSRF_SECRET` | At least 32 random characters; generated by setup |
| `SESSION_IDLE_MINUTES` | 60-minute inactivity timeout |
| `SESSION_ABSOLUTE_HOURS` | 12-hour absolute session lifetime |
| `PG_BIN_DIR` | Optional PostgreSQL tools directory for local helper |
| `TEST_DATABASE_URL` | Optional isolated test database; name must end in `_test` |
| `ERP_ADMIN_LOGIN/NAME/PASSWORD` | Optional operator-supplied initial owner credentials |

The web app reads `.env` in its server configuration; secrets are never `NEXT_PUBLIC_*`. Keep `API_PORT` and `INTERNAL_API_URL` in agreement if changing ports. Restart both servers after environment changes.

## Owner bootstrap and login

```powershell
npm run db:admin
Get-Content -LiteralPath .local\admin-credentials.txt
```

The default username is `owner`; the generated password is random, not a shared default. Only the initial user, roles/permissions, shop configuration and chart-of-account definitions are inserted. No transactions, products, customers, suppliers, stock or balances are seeded. Re-running for an existing login preserves its password.

To supply a password yourself, set `ERP_ADMIN_PASSWORD` securely in the process environment before running the command. Production requires a supplied password of 12–256 characters and never writes it to disk. This bootstrap is not a password-reset tool. Password change/reset and user administration screens are pending; do not delete or edit user database rows to bypass them.

## Start and open

```powershell
npm run dev
```

Or run `npm run dev:api` and `npm run dev:web` in separate terminals. Watchers rebuild/restart when source changes. These servers bind to loopback for local review, not access from another device on the network.

| URL | What opens |
| --- | --- |
| `http://localhost:3000/preview` | Public UI preview; em dashes instead of fabricated business values |
| `http://localhost:3000/login` | Real PostgreSQL-backed sign-in |
| `http://localhost:3000/dashboard` | Authenticated live dashboard; zero totals are genuine when no transactions exist |
| `http://localhost:3001/api/v1/health` | API and migrated-database readiness |

Use the exact `APP_ORIGIN` hostname for login. `localhost` and `127.0.0.1` are different browser origins. The frontend process prints a 127.0.0.1 address because it binds to loopback; default authenticated writes are permitted from **http://localhost:3000**. Read-only preview works at either hostname.

During local HTTP development the session cookie is `hb_session`, HttpOnly and SameSite=Lax. Production uses `__Host-hb_session` with Secure, HttpOnly, Path=/ and no Domain. This deliberate development transport exception does not change the production session design. CSRF/Origin checks still apply locally.

## Validation

```powershell
npm run db:validate
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
npm run check:docs
npm audit
```

Stop development watchers before doing a clean install or production build, especially on Windows where loaded native modules can lock files. `build` generates Prisma Client, compiles NestJS, and builds Next.js; it does not launch servers or connect to a business database for page generation.

`npm test` creates/uses `hawlader_erp_test` only for the project-local helper configuration. With another database, set `TEST_DATABASE_URL` to a pre-created, isolated database ending in `_test`. The runner refuses to fall back to a non-test database. It applies migrations before running the suite. Test fixtures remain only in that isolated database; append-only history is not deleted to clean tests.

Browser tests require the development servers and the initial owner. Installed Windows Chrome is detected automatically. Otherwise:

```powershell
npx playwright install chromium
npm run test:e2e
```

You can set `PLAYWRIGHT_CHANNEL=chrome` or `msedge` when using an installed browser. The suite uses desktop and mobile viewport emulation; it does not certify physical mobile devices. If the password was supplied instead of generated, set `ERP_E2E_LOGIN` and `ERP_E2E_PASSWORD` in the test process environment. Screenshots and failure traces go to ignored `test-results`.

## Troubleshooting

- Missing `.env`/CSRF secret: run `npm run setup`, or populate the existing file from `.env.example` without overwriting your secrets.
- Missing Prisma Client: run `npm run db:generate`.
- Database unavailable or missing tables: run `npm run db:local` when using the isolated helper, then `npm run db:migrate`; check the API health URL. A separate UI preview remains available without the database.
- Sign-in returns 403: use `localhost:3000` matching APP_ORIGIN and allow browser cookies. Refresh the page to get a current CSRF token. Do not disable CSRF checks.
- Sign-in returns 429: the persistent limiter uses a 15-minute window. Do not erase security tables in a real database to bypass it. The loopback API intentionally does not trust arbitrary forwarded IP headers; production proxy/rate-limit configuration is still a deployment task.
- Port in use: stop the previous task-owned dev servers with Ctrl+C. Do not kill unrelated PostgreSQL services.
- Migration fails on an existing business database: stop and inspect/reconcile the schema first; never reset or force-push it. Phase 2 is intended for a new development database.

Live-data backups, tested restoration, production migrations/access roles, TLS/proxy hardening and deployment remain release gates in Phase 6. An ignored local database directory is not a backup.
