# Phase 2 delivery and verification

Delivery date: 2026-11-13, Asia/Dhaka. Scope: runnable local application foundation and UI review. Phase 3 business posting has not started.

## Implemented

- npm workspaces with pinned dependencies and lockfile, Next.js App Router/React/TypeScript frontend and NestJS API.
- Tailwind CSS, local shadcn-style component sources using Radix primitives, CVA and shared design tokens, Lucide icons, responsive navy sidebar and light workspace. `components.json` supports subsequent shadcn component additions.
- Login form with Zod validation, explicit loading/error states, public no-data preview, authenticated dashboard, all required module routes, read-only configured users and settings foundation.
- Backend DTO validation, generic errors/request IDs, allowed-Origin and CSRF enforcement, database-backed opaque sessions, Argon2id hashing, session rotation, logout/revocation, inactivity and absolute expiry, disabled-user/password-change checks, persistent login throttling and audit events.
- Four roles with permission grants created by the operator bootstrap. Current grants are queried on every authenticated API request. Finance information is omitted from unauthorized DTOs, not merely hidden visually.
- Dashboard queries from PostgreSQL for real counts, posted ledger totals, actual received purchases, cash payment receipts, recent sales, stock alerts and replacement counts. Today/7-day/30-day filters use Dhaka date boundaries. No mock business record is seeded or substituted if data is unavailable.
- Shared TypeScript DTOs between API and frontend, without Prisma types in the browser. Full generated OpenAPI/client tooling remains a follow-up; existing Phase 1 posting contracts remain design artifacts.
- Prisma schema with 63 models covering the documented foundation and future business entities. Three migrations provide the initial schema, explicit integrity rules, and a deferred replacement-lineage foreign key. They include unique indexes, nonnegative checks, active-allocation/claim/dispatch uniqueness, product subtype rules, immutable unit identity, parts-only balances, immutable journals/movements/audit, and deferred balanced-journal enforcement.
- Isolated project-local PostgreSQL helper, ignored random environment secrets, operator-created owner account, separate test database runner and local development instructions.

The workspace now follows the eight reference screenshots supplied by the user: navy navigation, green actions, bilingual labels, pastel summary cards, and distinct Dashboard, Products, Purchase, Inventory, Replacement, Sales, Customers and Accounts layouts. Inter and Noto Sans Bengali fonts are bundled locally. Tables, filters, tabs, summary panels, draft forms and detail panels provide a responsive design review. No sample business figures or products from the images are inserted into PostgreSQL. Incomplete commands open an explanatory dialog and do not write records; list/detail data and form posting still require their later-phase APIs. Read-only stock-condition and replacement-stage counts come from the database.

## Verification

Executed against Node 24.21.0, npm 11.19.0 and PostgreSQL 18.6 on Windows. Browser checks use installed Chrome with desktop and iPhone-sized viewport emulation.

| Check | Evidence / scope |
| --- | --- |
| Prisma validation/generation | Schema validates and Prisma Client generates successfully |
| Migration installation | Initial migrations installed into new development/test databases; the third migration upgrades replacement-lineage FK timing without altering existing migration checksums; repeat deploy is safe |
| Backend integration | 13 tests cover real PostgreSQL auth/CSRF/Origin/DTO, secret hashing, finance denial/omission, Dhaka date ranges and revenue/COGS trends, rotation/logout, expiry/disable, current permissions, throttling, journal rollback/immutability, battery identity constraints, and transactional replacement lineage |
| Browser flow | 6 Playwright tests across desktop/mobile: eight screenshot-based module layouts, preview labeling, no horizontal overflow, mobile navigation, draft-action notices with no POST requests, real login/dashboard, every module route, configured user display, logout and denied session access |
| Build | NestJS TypeScript and Next.js production build pass |
| Type checks | Frontend, backend, shared DTO usage, tools and tests pass |
| Lint | ESLint 10 with compatible Next.js and React Hooks plugins passes |
| Dependency audit | `npm audit` reports zero vulnerabilities at validation time; minimatch override is pinned to 11.0.8 |
| HTTP readiness | `/api/v1/health` returns database connected; `/login` and `/preview` return 200 |
| Database outage/restart | Project-local database was stopped: health and login returned 503 DATABASE_UNAVAILABLE; helper restart preserved data and left the existing system service untouched |
| Phase 1 artifacts | Original contract/link/workflow checker is retained and adapted to ignore build/local-data directories |

The browser tests create only authentication sessions/audit events in the development database. Synthetic schema/security fixtures are created solely in the isolated `_test` database. Screenshots were inspected for desktop and mobile layout; physical phones and thermal printers have not been tested.

These checks establish the Phase 2 foundation only. They do **not** establish purchase receiving, sales concurrency/idempotency, replacement posting, returns, COGS reconciliation, PDF/export correctness or production recovery. Those commands do not exist yet and the fifteen full business scenarios in [TEST_PLAN.md](TEST_PLAN.md) are not marked passed.

## Live API surface

The API is loopback-bound at port 3001, behind Next.js's same-origin `/api/v1` proxy for browser use:

| Endpoint | Access |
| --- | --- |
| `GET /api/v1/health` | Public, database and required-table readiness |
| `GET /api/v1/auth/csrf` | Public pre-auth token or session-bound token |
| `POST /api/v1/auth/login` | Allowed Origin + CSRF + DTO + persistent limiter |
| `GET /api/v1/auth/me` | Current valid session; safe user/role/permission DTO |
| `POST /api/v1/auth/logout` | Session + allowed Origin + session CSRF |
| `GET /api/v1/dashboard` | `dashboard.read`; finance DTO only with `finance.read` |
| `GET /api/v1/reports/financial-summary` | `finance.read`; initial posted-ledger summary, not complete reports |
| `GET /api/v1/users`, `GET /api/v1/roles` | `access.manage`; read only |
| `GET /api/v1/settings/shop` | `settings.manage`; read only |
| `GET /api/v1/audit-logs` | `audit.read`; latest 50 safe events |
| `GET /api/v1/modules/{module}` | Authenticated module-specific permission; explicit FOUNDATION_ONLY response |

The remaining endpoints in [API.md](API.md) and the critical-command OpenAPI file are planned. Initial module routes deliberately show availability notices rather than invoking missing write APIs. Settings and users are read-only; user/role editing, password reset/change, self-service session management and last-owner administration safeguards need implementation before administration is opened for writes.

## Pending work

1. Phase 3: master-data CRUD, suppliers, purchase drafts/receipts, stock ledger commands, opening balances, audited adjustments and command idempotency infrastructure. The schema exists; those operations do not.
2. Phase 4: customers/vehicles/sets, POS, exact unit/FIFO selection, invoices, payments/expenses/returns/corrections and tested financial posting.
3. Phase 5: complete warranty/replacement state transitions, dispatch/partial receipt, inspection, reservation/delivery, rejection resolution and faulty-successor exceptions.
4. Phase 6: complete reports/exports, physical printer tests, full business/concurrency test matrix, security hardening, least-privilege runtime DB roles, backups/restore drill and production deployment.
5. Foundation follow-ups: user/role/password/session administration UI and APIs; editable persisted settings; complete API schema/type generation; richer user-facing report/query controls and server-side pagination before large datasets.

Initial database checks enforce important row/history constraints, but aggregate business invariants such as cumulative receiving quantities, payment over-allocation and cross-command stock reconciliation still require transactional command services in later phases. Do not write business data directly with Prisma Studio or SQL to simulate completed modules.

## Deliberate implementation choices

- Use Prisma 7.10.1 with its matching PostgreSQL adapter/client and explicit `prisma7.config.ts`. Prisma 8 was a release candidate at implementation time; no major-version scaffold upgrade was applied.
- Use TypeScript 5.9.3 to satisfy the installed compiler/tooling compatibility range, rather than adopting an incompatible latest major.
- Use ESLint 10 with direct compatible Next.js/React Hooks plugins. The aggregate eslint-config-next package still pulled plugins whose peer ranges excluded ESLint 10; it was removed instead of leaving incompatible peer overrides.
- Use the requested local Next.js/NestJS/PostgreSQL stack. No hosted Site, third-party authentication vendor, external account, or public deployment was provisioned.
- Prisma connections explicitly use UTC for timestamp parameters, independent of the host database timezone. Business-day grouping and labels explicitly use Asia/Dhaka.
- Local HTTP cookies intentionally lack the production `__Host-`/Secure attributes. Production switches both on and requires HTTPS; Origin/CSRF protections remain active locally.
- Server-rendered pages contain no private records. The session provider fetches safe identity first, then dashboard/module APIs; the API is the authorization boundary. Richer authenticated server rendering can be introduced later without moving database writes into Next.js.

The original [business rules](BUSINESS_RULES.md) and replacement design are unchanged.
