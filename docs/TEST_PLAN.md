# Verification and acceptance plan

Status: planned tests, not implemented or passed business tests. Phase 1 has only an artifact consistency checker: `node scripts/validate-phase1.mjs`. It checks files/contracts, not business correctness.

Phase 2 update: real PostgreSQL authentication/schema tests and desktop/mobile browser tests now exist. Their scope/results are recorded in [PHASE_2.md](PHASE_2.md#verification). Required business workflow tests below remain future-phase acceptance requirements; the full T01–T15 matrix is not marked complete.

## Test environments

- Domain arithmetic/unit tests: decimal allocation, eligibility, policy dates, permission mapping and canonical hashing. Never use a duplicate in-memory ERP as the only evidence of correctness.
- Integration tests: actual migrated PostgreSQL matching production major, with isolated databases/fixtures and independent connections for concurrent HTTP requests. SQLite and repository mocks cannot prove PostgreSQL locks or constraints.
- API/security tests: sessions/CSRF, denied roles, redacted DTOs/errors/exports, stale versions, idempotency and rollback. Authenticate as actual role fixtures.
- Browser tests: actual Next.js → NestJS → PostgreSQL flow, quick customer creation, POS, print/PDF, replacement receipt and delivery. Fixtures must be synthetic, isolated, and visibly excluded from production.
- Operational tests: fresh migrations, upgrade rehearsal, backup/restore reconciliation, secret handling, printer hardware and large-report behavior.

## Required business scenarios

| ID | Scenario and assertions | Phase |
| --- | --- | --- |
| T01 | Receive two batteries and parts: one batch per receipt line, unique unit IDs, correct balances/movements and inventory/payable journal; supplier/order status reconciles | 3 |
| T02 | Save/edit/cancel purchase draft: zero stock movement, no unit creation, no payable; supplier advance does not receive stock | 3 |
| T03 | Confirm multi-item sale: exact battery states and parts layers decrease once, invoice and journal/allocations agree; draft has no effect | 4 |
| T04 | Sell already sold/reserved/faulty battery: conflict with no second invoice movement/payment; wrong product IDs fail | 4 |
| T05 | From 10 shop-owned units mark 2 replaceable: 10 accounted, 8 available, 2 faulty; POS refuses those 2; one case per unit | 5 |
| T06 | Dispatch several cases: supplier custody and SENT_TO_COMPANY change atomically; wrong supplier/state and duplicate dispatch fail | 5 |
| T07 | Receive replacement: distinct new ID, correct provenance/batch, successor initially quarantined, before-sale release available only after GOOD inspection; no purchase | 5 |
| T08 | Old unit retains original serial/date/cost/movements and links to successor; repeated descendant warranty claim retains original sale and expiry | 5 |
| T09 | Customer warranty receipt reserves inspected successor exclusively for original customer; ordinary sale and wrong-customer delivery fail; correct delivery completes once | 5 |
| T10 | Partial customer payment reduces invoice/party due, leaves revenue/COGS unchanged, posts to selected asset account; over-allocation and mismatched party fail | 4 |
| T11 | Battery actual landed cost and multi-layer parts FIFO drive COGS; header discounts and rounding are allocated; gross/net profit subtract actual costs/expenses; payments do not duplicate revenue | 4 |
| T12 | Race two independent confirmed sales for one available unit and for insufficient parts quantity: only eligible quantity commits, no negative balance, losing command has no partial invoice/journal/payment | 4 |
| T13 | Same-key concurrent/retried receipt/sale/replacement/payment returns one posting/result; changed payload conflicts; different key cannot repost finalized source; late injected failure rolls everything back | 3–5 |
| T14 | Receive multiple production-date-only units sharing date: distinct internal IDs, no false duplicate; BOTH missing serial fails; normalized repeated serial in chosen scope fails | 3 |
| T15 | Sales/inventory roles cannot fetch cost/profit/purchase-sensitive fields via detail, nested units, dashboard, financials, CSV, PDF, errors, or direct URL; backend denies even when UI guard bypassed | 2–6 |

## Additional launch gates

| Area | Assertions |
| --- | --- |
| Partial receiving | Multiple receipts under one order never exceed remaining quantity; repeated/racing final receipt cannot duplicate units; cost residuals conserve header totals |
| Batch replacements | Receive 2 of 5 dispatched cases: only 2 progress; other 3 remain supplier-held. Receipt from another supplier/dispatch conflicts |
| Inspection failure | Received successor fails: remains unavailable and claim unresolved; no accidental ready/completed state; explicit rework path preserves lineage |
| Rejection | No successor created; supplier-return custody and customer acknowledgement recorded; shop stock not silently available; scrap write-off exactly once |
| Warranty | Original expiry, configured month-end/leap-day arithmetic, eligibility boundary in Dhaka date, authorized override audit, repeated descendant claim |
| Corrections | Partial return, refunded/credit payments, full cancellation, received-purchase downstream conflict, journal and movement reversals retain immutable history |
| Accounting | Every posting balanced; inventory/COGS/receivable/payable control accounts reconcile; advances do not become sales revenue; expense/payment not double-counted |
| Auth | Invalid login throttling, CSRF and Origin checks including login/logout, cookie flags, session rotation/expiry/revocation, disabled user, role change next-request enforcement |
| Validation | Unknown fields, malformed decimal/date, duplicate request unit IDs, integer battery quantities, impossible dates, invalid subtype and state combinations |
| Dhaka reports | Transactions just before/after Dhaka midnight and range end counted exactly once; UTC host/browser timezone changes do not change business day |
| Print/export | A4 and actual 80mm printer readability, pagination, Bangla font if enabled, all battery IDs/warranty details; private PDF/export access and CSV formula neutralization |
| Failures | Disconnect/retry after successful commit; stock conflict retains cart; PDF/storage failure cannot re-post sale; serialization/deadlock retries bounded |
| Restore | Restore encrypted backup into isolated database; reconcile all stock/journal/source links; verify recent sample receipts/invoices and measured RPO/RTO |
| Cutover | Opening unit identities/costs and customer/supplier balances approved; imports idempotent; synthetic fixture records absent from production |

## Evidence required per phase

Record command, environment/runtime/database versions, pass/fail counts, skipped tests and reasons, known defects, and reconciliation output. A green artifact checker is not evidence that the fifteen business tests passed. A mocked concurrency test is not evidence that PostgreSQL prevents overselling. A PDF file existing is not evidence that a real thermal printer renders it correctly.
