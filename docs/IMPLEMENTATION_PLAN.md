# Phased implementation plan

Latest delivery date: 2026-11-13, Asia/Dhaka. Phase 1 remains documented and the Phase 2 local foundation is now implemented. Each phase ends with implemented functionality, tests actually run, unresolved issues, and the next phase. Do not report planned behavior as working software. See [PHASE_2.md](PHASE_2.md) for the current delivery record and [DEVELOPMENT.md](DEVELOPMENT.md) for exact setup commands.

## Phase 1 — Architecture and planning

Deliver repository assessment, modular architecture, normalized entity design/ER diagram, stock/replacement state diagrams, permission and accounting rules, sidebar/routes, REST catalog, critical command schemas, acceptance matrix, and this implementation plan.

Completion gate:

- [x] Inspect workspace and applicable repository instructions; preserve existing work.
- [x] Document required modules and data/state ownership.
- [x] Define purchase/sale/replacement transaction boundaries and idempotency strategy.
- [x] Define individual battery identity, source/ownership/custody separation, value and warranty lineage.
- [x] Describe corrected/reversed transactions and actual-cost profit.
- [x] Record permissions, session design, operations and backup requirements.
- [x] Supply a local artifact checker and executable JSON design contracts.
- [ ] Later business workflow tests: intentionally not implemented in Phase 1.

Phase 1 verification checks document/contract integrity only. It does not run an ERP or validate a deployed database. The [test plan](TEST_PLAN.md) names the real database and browser checks required later.

## Phase 2 — Foundation

1. Select maintained compatible package releases; record exact Node/npm/framework/database versions, pin dependencies, and commit a lockfile after a clean install/build.
2. Initialize the proposed npm workspace layout, Next.js frontend, NestJS backend, shared config, and API type generation. Initialize version control if desired; no remote is assumed.
3. Implement the Prisma entity model and reviewed SQL constraints/indexes. Create initial migration(s), run on isolated PostgreSQL, and verify both fresh installation and migration replay.
4. Validate server environment variables and provide `.env.example` without secrets. Configure a local/test database workflow compatible with Windows or a supplied remote development database; Docker is optional.
5. Implement secure sessions, CSRF/Origin protections, Argon2id passwords, initial-admin CLI, RBAC, audit infrastructure, structured errors and request IDs.
6. Implement light responsive sidebar/header, form/table components, empty/loading/error states, BDT/date formatters, and authenticated route shell.

Gate: clean Next/Nest production builds; migrations on a real database; auth/CSRF/session expiry/revocation tests; permission and financial-field omission tests; no exposed secrets/default credentials. Schema existence alone does not make purchasing or sales implemented.

## Phase 3 — Product and inventory foundation

1. Product types, brands, categories, battery/parts product CRUD and deactivation with canonical identity validation.
2. Supplier records, purchase drafts, discount/landed-cost plan, received-cost recognition, and supplier payment/advance foundation.
3. Partial/full receiving with identity validation, generated battery IDs, batches, parts balances, append-only movements, and balanced receipt journals.
4. Operational stock list/filters, exact battery timeline, FIFO layer query, low-stock calculation, and controlled opening balance/adjustment flow.
5. Idempotent command infrastructure, stable lock order, source uniqueness, concurrency retries, and reconciliation queries.

Gate: draft never adds stock; receiving increases only intended units; repeated request/source cannot duplicate stock; over-receipt and duplicate serial fail; repeated production dates succeed with unique IDs; costs and supplier payable reconcile. Run T01, T02, T13, T14 and relevant security/ledger tests below before reporting complete.

## Phase 4 — Sales and accounts

1. Customer CRUD, vehicles, battery sets, and account/history views.
2. Draft sale cart, exact battery picker, parts FIFO allocations, pricing/discount/warranty guards, and transactional confirmation.
3. Immutable A4/80mm invoice snapshots, browser print, downloadable PDF, and retryable document generation.
4. Full/partial/due payments and multiple methods, party allocations/advances, expenses, receivables/payables, cash/mobile/bank separation, and actual-cost profit read models.
5. Safe sale cancellation, partial returns, supplier returns/credits, refunds, expense settlements, payment/expense reversal and correction audit. Reject unsupported complex corrections explicitly.

Gate: T03, T04, T10–T13, T15; double confirmation under both same and different keys; competing sale transactions; late-failure rollback; discount/cost/warranty snapshot checks; invoice print/PDF verification; returned faulty units never available. Full sale flow must pass browser → API → database → invoice → account reconciliation.

## Phase 5 — Replacement system

1. Before-sale fault intake and individual customer warranty intake with eligibility snapshots, inspection records and claim receipts.
2. Supplier challans with multiple claims, dispatch custody changes, supplier review and rejection handling.
3. Partial replacement receipts, new immutable unit identity, predecessor/successor lineage, carrying-cost handling and mandatory post-receipt inspection.
4. Before-sale release into stock; customer reservation and correct-customer delivery receipt; repeated replacement lineage and preserved original expiry.
5. Supplier rework flow for a faulty received successor, rejected-unit returns/disposal, fees/transport/adjustments, and complete audit/timeline views. Document its additional state events before implementing exceptions; no generic status patch.

Gate: T05–T09 plus duplicate/batch/concurrent replacement operations; partial receipt conservation; rejected physical return; failed successor inspection; repeated claim on a descendant; all stock and journal reconciliation. Claims must never create a hidden purchase or reset warranty without a policy override.

## Phase 6 — Reporting and production preparation

1. Build dashboard and date filters using posted production records only; operational DTOs omit restricted finance fields.
2. Sales/purchase/stock/replacement/aging/cash/profit-loss reports and authorized CSV/PDF exports. Reconcile reports with journals, units and movements over Dhaka date boundaries.
3. Complete full-flow integration/concurrency/browser tests, accessibility and mobile review, dependency/security review, load and print checks. Capture evidence and known limitations.
4. Implement automated encrypted backup jobs, failure alerts, retention, least-privilege access and a tested restoration runbook. Execute an isolated restoration drill and record actual RPO/RTO.
5. Prepare hosting, TLS, environment separation, private export storage, observability, migration rehearsal, rollback/forward-fix procedures, initial-admin and cutover runbooks.
6. Import only verified opening balances/stock with traceable costs, duplicate checks and owner reconciliation. Dry-run cutover first.

Gate: all acceptance scenarios pass, every invariant reconciles, security and restoration checks pass, production builds and migrations are rehearsed, and employees can execute critical daily flows. Prepare a concrete release report before any live-data cutover. No provider or public deployment is created in Phase 1.

## Decisions to confirm before dependent implementation

These do not block the Phase 1 documents. Record answers as dated decisions and update contracts before the relevant implementation.

| Decision | Proposed baseline | Needed before |
| --- | --- | --- |
| Shop address/phone, invoice language/logo/terms | Configurable; no fabricated values | Phase 2 settings / Phase 4 printing |
| Hosting, database access and backup operator | One same-origin deployment, managed PostgreSQL where suitable | Phase 2 integration / Phase 6 launch |
| Exact packages and PostgreSQL version | Node 24; select compatible maintained versions with clean builds | Phase 2 |
| Warranty per brand, start basis and coverage exclusions | Original sale expiry, preserved through replacements; policy snapshots | Phase 4 sale warranty / Phase 5 claims |
| Serial uniqueness across models/brands | Normalized serial unique per product | Phase 3 identity constraints |
| Discount limits and below-cost authority | Owner controls thresholds; staff never see costs | Phase 4 |
| Purchase freight/discount allocation and later vendor corrections | Freeze planned cost before first receipt; adjustments append journals | Phase 3 |
| Parts units/fractional quantities | Product base unit, up to 3 decimals; batteries integer | Phase 3 |
| Equivalent replacement models and faulty successor supplier rework | Explicit approval and lineage, unavailable until accepted; document rework events | Phase 5 |
| Supplier rejection, fees, write-offs, customer disposal consent | Explicit resolutions and authorized journals | Phase 5 |
| Overpayments and refunds | Reject accidental over-allocation; explicit advances/refunds | Phase 4 |
| Tax/VAT and regulated invoice requirements | No invented tax rate; validate applicable business policy | Before relevant invoice/accounting features |
| Printer, paper margin, Bangla fonts | A4 and 80mm templates; test actual device/driver | Phase 4 / Phase 6 |
| Existing records and opening balance cutover | Approved reconciled import, never catalog-created stock | Phase 3 / Phase 6 |
| Backup retention and service objectives | Nightly plus PITR if available; prove restoration targets | Phase 6 |

## Delivery record

Phase 1 added planning documents, critical command/transition JSON and a dependency-free consistency checker; it implemented no runtime features. Its checks cover deliverables, links, 13 critical command contracts, JSON references, 9 replacement edges and the fifteen planned business scenarios.

Phase 2 adds the runnable Next.js/NestJS/PostgreSQL foundation, migrations, authentication/RBAC, responsive dashboard and module routes. Foundation integration/browser tests, build, lint and type checks are detailed in [PHASE_2.md](PHASE_2.md). User/role/password administration writes, settings editing and full generated API schema tooling remain pending foundation follow-ups. Full business workflow acceptance tests remain unimplemented because posting commands belong to Phases 3–5. Phase 3 is the next business implementation scope and has not begun.
