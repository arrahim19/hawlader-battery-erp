# Hawlader Battery ERP

Vercel hosting setup: [deployment guide](docs/VERCEL.md).

ERP and POS for Hawlader Battery House, Bangladesh: individually tracked batteries, auto parts, purchasing, sales, warranty replacements, accounts, and reporting.

## Current status

**Phase 2: runnable local foundation.** Next.js frontend, NestJS API, PostgreSQL/Prisma migrations, secure session login, backend permissions, and a responsive dashboard are implemented. The dashboard reads actual database records; an empty database displays zero totals and empty lists. `/preview` is an explicitly labeled UI preview with no business calculations.

Purchase drafts/partial receiving, POS posting, replacements, financial corrections, complete reports, user administration, and production operations remain future work. This is a local development release, not a production ERP.

Supplier contacts support saving and browsing real database records at `/suppliers`, with search, status filtering, pagination, and contact details. Name and mobile are required; company and address are optional. Standalone supplier payments remain future work.

Sales use sequential six-digit invoice numbers such as `HWB-000001`. New Sale shows persisted Recent Sales, with a separate view for the current sale's items. Owners with `transactions.reverse` can use Delete on Recent Sales and Recent Purchases after confirming through a checkbox that goods and money have been returned. Deletion cancels the transaction through linked stock, payment and journal reversals; the original records remain as history. Sales with returns, warranty claims or incompatible corrections are blocked. Purchase cancellation requires a single complete receipt and all purchased stock still available; used stock must be reversed through its dependent transactions first.

Inventory / Stock (`/inventory`) contains the catalog and its left-hand Product Category filter. It is a single navigation entry with no Product List/Add Product dropdown, standalone Add Product page, or inventory product-entry dialog. Legacy `/products`, `/products/new`, and `/inventory/new` links redirect to `/inventory`; dashboard links open the stock overview. The category heading has a three-dot Add/Delete menu. Below it, product lists are headed directly by their category names, such as Battery or Parts, with a separate three-dot product-name Add/Delete menu for each category; there is no generic Product Name heading or separate Add/plus button. Opening Add from a category's menu preselects that category, including while All Products is selected. The interface calls database product types Product Category. Selecting a category/name enables its Delete action, followed by confirmation. Categories containing products cannot be deleted. A product name can be removed from its selected category only when no active or inactive products use that pair; shared names in other categories remain intact. All Products shows every category and its scoped names/counts, including names with zero products. New stock is added through Purchase. There are no Brands or separate Category-name inputs; existing database brand records remain intact. No preset categories or product names are seeded.

Workspace resource reads reuse a bounded cache within the authenticated session and revalidate in the background on navigation and window focus. Inventory preloads its default catalog and product list. Category selection reuses the same metadata instead of fetching it again. Active catalog metadata also survives reloads in account-scoped session storage for up to 15 minutes, after authentication is verified; successful writes, cross-tab write notifications, logout, and session expiration invalidate it. The inventory table headings remain visible during the first uncached product request. Initial authentication and uncached business data still require a server connection.

Production builds prerender the static workspace UI as HTML: navigation, page headings, filters, forms, and table headings. The session provider renders this layout immediately, with workspace controls inert until authentication completes. Database records, user identities, permissions, and current dates are resolved at runtime; no database reads run during static generation. For the compiled app without development compilation delays, run `npm run build`, then `npm start`. Development edits still use `npm run dev`.

Session identity, roles, and permissions are read with one parameterized SQL join per request, followed by the existing guarded activity update. Authorization remains live rather than cached across requests. A read-only comparison against Neon reduced the six-query identity read from 310–325 ms to 52–54 ms; these figures measure that read, not complete page loading. Vercel's API function is configured for Singapore (`sin1`) alongside the Neon database; the region change takes effect on the next deployment.

Customers store name, mobile, address, and account history. Vehicle type and identifier entry, vehicle search/grouping, and the customer Vehicle column/details have been removed, including the customer form inside Sales. The removal migration clears obsolete vehicle links and records and prevents new vehicle records at database level. An empty legacy Vehicle table remains readable for older deployed clients during rollout; it no longer stores customer vehicle information. Customer Details sizes to its own content rather than stretching with the customer list; its heading includes New Sale for the selected active customer.

Purchase (`/purchases`) selects products and an active supplier. If a product is not yet defined, its New Product dialog lets catalog writers enter the name, category, unit, model/tracking details, and optional selling defaults without leaving Purchase. Saving selects that product in the current purchase while preserving entered quantity and price; it does not add stock. Enter integer quantity, unit purchase price, and required battery identities, then Receive & Confirm to add available stock. Receiving creates the purchase, receipt, batch costs, stock movements, balanced inventory/payable journal, optional initial supplier payment, and audit atomically. Prices and quantities contain no discount. Due, full, and partial initial payment are supported; payment requires finance permission. Retrying the same submission cannot duplicate stock. Purchase List reads persisted purchases and payment allocations.

The New Purchase page fits the viewport with Receive & Confirm always visible. Long item lists use pagination; battery identities and optional notes open in dialogs. On phones, Details, Items, and Payment controls switch between panels without vertical page scrolling. Desktop and mobile browser checks cover short viewports and verify that the panels do not clip their contents.

The initial workspace was empty and was not a Git repository. Phase 1 documents have been preserved. See the [repository assessment](docs/REPOSITORY_ASSESSMENT.md), [development setup](docs/DEVELOPMENT.md), and [Phase 2 delivery record](docs/PHASE_2.md).

## Run locally on this Windows computer

Requires Node.js 26 LTS and installed PostgreSQL 18 tools. Run from the project root in PowerShell:

```powershell
Set-Location 'F:\Web Calculator\Hawlader Battery ERP'
npm ci
npm run setup
npm run db:local
npm run db:migrate
npm run db:admin
npm run dev
```

`npm ci` installs the locked dependencies and generates Prisma Client. `setup` creates an ignored `.env` with random secrets and preserves an existing one. `db:local` manages a separate project-owned PostgreSQL cluster on **127.0.0.1:55432**; it does not alter the existing PostgreSQL service on port 5432. Alternatives for your own database are in [DEVELOPMENT.md](docs/DEVELOPMENT.md).

To use **Neon instead of local PostgreSQL**, follow [the Neon connection setup](docs/DEVELOPMENT.md#database-option-c--neon-postgresql).
Set the pooled and direct URLs in `.env`; existing local records require a separate backup/restore.

Open:

- UI preview, no login needed: **http://localhost:3000/preview**
- Login: **http://localhost:3000/login**
- Authenticated dashboard: **http://localhost:3000/dashboard**
- API health: **http://localhost:3001/api/v1/health**

Use **localhost:3000** for login, matching `APP_ORIGIN`. The frontend's printed `127.0.0.1` URL has a different Origin and is not allowed for authenticated writes with the default configuration.

## Development login

The initial owner login defaults to `owner`. `npm run db:admin` generates a random password on first setup, creates roles/permissions and account definitions, and writes development credentials to an ignored local file:

```powershell
Get-Content -LiteralPath .local\admin-credentials.txt
```

No default password, sample products, customers, purchases, sales, or balances are seeded. Re-running the command preserves an existing login and password. The local credentials file contains a plaintext development secret; keep it private. Production bootstrap requires a supplied operator password and writes no credentials file.

## Run the servers separately

In two terminals at the project root:

```powershell
# Terminal 1 — API on port 3001
npm run dev:api
```

```powershell
# Terminal 2 — frontend on port 3000
npm run dev:web
```

Stop development servers with Ctrl+C. Stop only the project-owned database with `npm run db:stop`. Data persists in ignored `.local/postgres` across restarts.

## Phase 1 deliverables

| Deliverable                                                               | Location                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Architecture, module boundaries, security, and deployment approach        | [ARCHITECTURE.md](docs/ARCHITECTURE.md)                       |
| Entity relationships, field design, constraints, and transaction strategy | [DATABASE.md](docs/DATABASE.md)                               |
| Inventory, financial, warranty, and permission rules                      | [BUSINESS_RULES.md](docs/BUSINESS_RULES.md)                   |
| Stock and replacement diagrams and transition guards                      | [STATE_MACHINES.md](docs/STATE_MACHINES.md)                   |
| Sidebar, page hierarchy, and employee workflows                           | [ROUTES.md](docs/ROUTES.md)                                   |
| REST endpoint catalog and request/response conventions                    | [API.md](docs/API.md)                                         |
| Machine-readable critical command contracts                               | [OpenAPI](docs/contracts/critical-commands.openapi.json)      |
| Machine-readable allowed replacement transitions                          | [Workflow contract](docs/contracts/replacement-workflow.json) |
| Six phases, completion gates, and unresolved decisions                    | [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)         |
| Required business scenarios and future test coverage                      | [TEST_PLAN.md](docs/TEST_PLAN.md)                             |

## Implemented foundation stack

- Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide.
- NestJS REST API; PostgreSQL; Prisma ORM.
- Zod in browser forms; class-validator/class-transformer DTO validation in NestJS.
- PostgreSQL-backed opaque sessions, backend RBAC, append-only stock and financial records.
- BDT currency; business dates in Asia/Dhaka; UTC timestamps stored as `timestamptz`.
- Invoice layouts, PDF/CSV exports and posting workflows remain planned for later phases.

Dependencies are pinned in package manifests and `package-lock.json`. Tested versions and limitations are recorded in [PHASE_2.md](docs/PHASE_2.md). Prisma stays on the supported 7.10.1 release; the available Prisma 8 release candidate was deliberately not adopted.

## Checks

```powershell
npm run db:validate
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
npm run check:docs
```

`npm test` creates/uses **hawlader_erp_test**, separate from the development database, and applies committed migrations before integration tests. For a non-local server, supply an isolated `TEST_DATABASE_URL` whose database name ends in `_test`. Tests never use the business database as a fallback.

Browser tests require both development servers, a local owner, and Chrome or Playwright Chromium. On this computer, installed Chrome is detected automatically; otherwise run `npx playwright install chromium`. Browser tests log in and out but do not create business records. See the [verification record](docs/PHASE_2.md#verification).

## Validate the planning artifacts

Requires Node.js 26; no dependency installation or database required:

```powershell
node scripts/validate-phase1.mjs
```

This checks local Markdown links, required deliverables, JSON references, critical command coverage, and workflow contract consistency. It does **not** execute ERP business operations or prove transaction safety. Business integration, concurrency, security, browser, and printer checks remain planned in the [test plan](docs/TEST_PLAN.md).

Phase 1 contract checks remain useful but do not establish business workflow correctness. Vercel deployment configuration is included; live deployment still requires environment settings and database preparation in the [deployment guide](docs/VERCEL.md).

## Next phase

The catalog, supplier contacts, and direct purchase receiving flow are implemented. Purchase drafts, partial receipts, corrections, and remaining sales/replacement workflows are still pending. Remaining foundation administration work and policy decisions are listed in [PHASE_2.md](docs/PHASE_2.md) and the [implementation plan](docs/IMPLEMENTATION_PLAN.md#decisions-to-confirm-before-dependent-implementation).
