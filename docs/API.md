# REST API design

Status: proposed API, not served. Base path `/api/v1`; JSON unless a PDF/CSV response is requested. The [OpenAPI artifact](contracts/critical-commands.openapi.json) specifies critical posting/claim commands only. The endpoint catalog below covers the rest of the planned surface; it is not a claim of complete OpenAPI coverage.

Phase 2 update: authentication, dashboard, read-only administration and foundation module metadata endpoints are now served locally. The exact implemented subset is listed in [PHASE_2.md](PHASE_2.md#live-api-surface). All posting commands below remain planned.

## Common contract

- Opaque session cookie authentication, CSRF/Origin protection on unsafe requests, backend RBAC and object checks. No client-supplied actor IDs or calculated profit/totals.
- UUIDs for internal IDs; stable human document numbers in responses. Money and quantity use decimal strings; dates `YYYY-MM-DD`; timestamps RFC 3339 UTC.
- List queries: `q`, `page` (default 1), `pageSize` (default 25, max 100), allowlisted `sort`, and documented module filters. Response `{data: [...], meta: {page,pageSize,total}}`.
- Entity response `{data: {...}}`. Command result includes `id`, `status`, optional generated `documentNumber` and related IDs. Fetch a permission-specific detail DTO for totals/print data. Do not return Prisma objects directly.
- Editable document updates use `expectedVersion`. Stale versions produce 409. All posting/money/stock commands require `Idempotency-Key` (UUID) and return the original status/body for same-request replay, with `Idempotency-Replayed: true`. The canonical hash includes method, route/target IDs, normalized body and semantic headers; reusing a key against another document conflicts.
- A committed source cannot be reposted with a new key. Same source already finalized returns 409 `ALREADY_POSTED`; use GET to retrieve it. The API never trusts client balances, expiry, eligibility, or landed cost.
- Input types reject unknown fields, zero/negative quantities, duplicate unit IDs, invalid dates, unsupported enum values, and inappropriate product-specific identity fields. Database and in-transaction guards remain mandatory.

Error response:

```json
{
  "error": {
    "code": "UNIT_UNAVAILABLE",
    "message": "A selected battery is no longer available.",
    "requestId": "request-reference",
    "fields": {"items.0.batteryUnitIds": ["Refresh available units."]}
  }
}
```

Status codes: 200 read/update/command, 201 creation, 204 logout when appropriate; 400 malformed request, 401 no valid session, 403 permission/CSRF failure, 404 unknown or intentionally hidden resource, 409 state/version/stock/idempotency conflict, 422 business/field validation, 429 rate limit, 500 safe internal error, 503 unavailable dependency. Finance-denied responses must not leak restricted values through error messages.

## Endpoint catalog

`CRUD` below means GET collection, POST create, GET `/{id}`, PATCH `/{id}`. DELETE is not supplied for posted documents; masters use deactivate PATCH. Every write requires CSRF and per-operation permission. Command idempotency extends to any master write retried by the client; every business posting requires it.

| Resource / endpoints | Purpose and access |
| --- | --- |
| `GET /auth/csrf`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Pre-auth/session CSRF bootstrap; login rotates session; logout revokes it; me returns permission codes |
| `POST /auth/change-password`, `GET /auth/sessions`, `POST /auth/sessions/{id}/revoke` | Current-user password/session controls; no business idempotency replay for passwords |
| CRUD `/users`, `POST /users/{id}/reset-password`, `/users/{id}/deactivate` | Owner-managed users and one-time reset process; no password returned in lists |
| `GET/POST /roles`, `GET/PATCH /roles/{id}`, `GET /permissions`, `PUT /roles/{id}/permissions`, `PUT /users/{id}/roles` | RBAC administration; audit and revoke stale sessions |
| CRUD `/product-types`, `/brands`, `/categories`, `/products` | Master data; no inventory increment; separate cost DTO guarded by finance permissions |
| CRUD `/suppliers`, `/customers` | Party records; supplier contact-only and customer-only permission scopes |
| `GET/POST /customers/{id}/vehicles`, `PATCH /vehicles/{id}` | Vehicle ownership validated |
| `GET/POST /customers/{id}/battery-sets`, `PATCH /battery-sets/{id}` | Grouping; changes cannot rewrite sold-unit history |
| `GET /customers/{id}/account`, `/suppliers/{id}/account`, `/customers/{id}/history`, `/suppliers/{id}/history` | Permission-scoped ledger/history and due; paginated |
| CRUD `/purchases` | Create/edit only drafts; line costs and cost plan; supplier reference; no stock |
| `POST /purchases/{id}/receipts` | Post partial/full stock receiving, identities only, authoritative costs from draft |
| `GET /purchase-receipts/{id}`, `GET /purchases/{id}/receipts` | Immutable receipt details/history; cost-redacted variant for receivers |
| `POST /purchases/{id}/cancel-remainder`, `POST /purchase-receipts/{id}/reverse` | Controlled cancellation/correction; refuse unsafe downstream dependencies |
| `POST /supplier-returns`, `GET /supplier-returns/{id}` | Approved purchase return/credit with exact original stock/cost linkage, not receipt deletion |
| `GET /inventory`, `/inventory/battery-units`, `/inventory/battery-units/{id}`, `/inventory/movements` | Product/type/brand/category/status filters; unit timeline, custody/availability separate |
| `POST /inventory/adjustments`, `POST /inventory/opening-balances` | Privileged explicit stock/valuation postings with reason and audit |
| `GET /sales`, `POST /sales`, `GET/PATCH /sales/{id}` | Sales list and draft cart; no deduction or reservation until confirm |
| `POST /sales/{id}/confirm` | Exact units/FIFO parts allocation, invoice, journal, initial tenders in one transaction |
| `GET /sales/{id}/invoice?format=a4|thermal80`, `GET /sales/{id}/invoice.pdf?format=a4|thermal80` | Invoice DTO/PDF without costs; immutable issue snapshot |
| `GET /sales/{id}/financials` | Separate finance-authorized cost/profit DTO |
| `POST /sales/{id}/returns`, `GET /sales/{id}/returns`, `POST /sales/{id}/cancel` | Return/refund or full privileged reversal; finalized sale not patched |
| `GET /payments`, `POST /payments`, `GET /payments/{id}`, `POST /payments/{id}/reverse` | Incoming/outgoing partial payments, allocations, explicit advances and reversals |
| CRUD `/expense-categories`, `GET/POST /expenses`, `GET /expenses/{id}`, `POST /expenses/{id}/reverse` | Posted expenses immutable; payments linked to avoid double recognition |
| `POST /expenses/{id}/settlements`, `POST /expense-settlements/{id}/reverse` | Settle incurred expense through selected asset account without repeating expense recognition |
| `GET /accounts`, `/journals`, `/journals/{id}` | Finance read; no generic public journal edit |
| `GET /replacements`, `/replacements/{id}` | Source/status/supplier/customer/age filters and lineage |
| `POST /replacements/before-sale` | Faulty unsold intake; creates case plus unavailable stock movement |
| `POST /warranty-claims`, `GET /warranty-claims/{id}` | Customer sold/descendant-unit intake and eligibility snapshot |
| `POST /replacement-dispatches`, `GET /replacement-dispatches`, `GET /replacement-dispatches/{id}` | Batch claims to one supplier, challan, supplier custody |
| `POST /replacements/{id}/review` | Supplier review acknowledgement; correct prior state required |
| `POST /replacement-receipts`, `GET /replacement-receipts/{id}` | Partial supplier return; one new unit per selected claim; no purchase |
| `POST /replacements/{id}/inspect` | Append inspection; failed result remains unavailable; pass releases by source |
| `POST /replacements/{id}/deliver` | Deliver exactly reserved customer unit, receipt, completion |
| `POST /replacements/{id}/reject`, `POST /replacements/{id}/resolve-rejection` | Supplier decision and separately tracked return/disposal settlement |
| `GET /replacements/{id}/receipt?kind=claim|delivery|rejection&format=a4|thermal80`, same `/receipt.pdf` | Permission-scoped claim, delivery, return documents |
| `POST /replacements/{id}/charges` | Approved fees/transport/supplier adjustment with explicit journal treatment |
| `GET /dashboard?from=...&to=...` | Permission-specific operational/finance summaries; default current Dhaka day |
| `GET /reports/{reportCode}` | Allowlisted sales/purchases/inventory/replacements/receivables/payables/profit-loss/cash; permission-specific DTO |
| `POST /exports`, `GET /exports/{id}`, `GET /exports/{id}/download` | Authorized PDF/CSV exports with creator/scope checks and expiring private download; no export of hidden costs |
| `GET/PATCH /settings/shop`, `/settings/invoices`, `/settings/payment-methods` | Versioned settings; immutable posted snapshots |
| `GET/POST /warranty-policies`, `GET /warranty-policies/{id}` | Versioned supplier/product warranty settings; old versions immutable |
| `GET /audit-logs` | Owner/audit permission; filters and pagination, no edit/delete |

Operational receiving uses `/purchases/{id}` with a receiving-specific DTO and permission, rather than granting unrestricted purchase access. Availability responses never include unit cost for ordinary staff. Reports resolve reportCode against a server allowlist, not a dynamic SQL fragment.

## Critical payloads and semantics

Implemented catalog: `GET /catalog` returns the three permanent product categories in order (Battery, Parts & Accessories, Easy Bike & Rickshaw) and database-backed brand/category facets with counts; optional `typeId` scopes facet counts and `status=active|inactive|all` scopes product counts. Battery uses `BATTERY_UNIT`; Parts & Accessories and Easy Bike & Rickshaw use `QUANTITY`. `POST /product-types` rejects category creation with 409. Database migrations provision the permanent categories and preserve existing matching IDs and historical types.

`POST /categories` accepts an active permanent-category `typeId` and nonblank `name`, requires `catalog.write`, and saves a normalized name linked to that type with an audit event. The inventory interface labels these records Product Name; the storage and API retain the category identifier for compatibility. Catalog category facets include `typeIds`, including zero-product names, and `productCountsByType`, independent of the current type scope. All Products renders separate type/name groups; name selection sends both `typeId` and `categoryId`. Name creation alone does not create a purchasable product or stock. `DELETE /product-types/{id}` requires `catalog.write`, CSRF, allowed Origin, and `{ "confirmed": true }`. Category deletion always returns 409; permanent categories cannot be deleted.

`GET /products` requires `catalog.read` and supports `q`, `typeId`, `categoryId`, comma-separated `brandIds`, `status`, `page`, and `pageSize` (maximum 100). `POST /products` requires `catalog.write`, CSRF, allowed Origin, an active permanent-category `typeId`, `name`, and `unit`. Optional fields include `model`, legacy `brand`, `category`, decimal-string `defaultSellingPrice` and `lowStockThreshold`, and integer `warrantyMonths`. Quantity tracking requires a name group (`category`) and optionally accepts `specifications`; individual-unit tracking requires positive decimal-string `capacityAh`/`voltage` and `identificationMethod=SERIAL|PRODUCTION_DATE|BOTH`, with no Brand requirement. The New Product dialog inside Purchase uses this API, omitting Brand and separate Category fields and setting `category` to the entered product name. There is no standalone inventory product-entry page; old `/inventory/new` and `/products/new` frontend links redirect to the stock overview. Product definition preserves the purchase cart, quantity and price; stock is posted only by `/purchases/receive`. New names are normalized and saved atomically with the product, subtype detail, type link, and audit event. Product creation generates an SKU, rejects duplicate identities, creates no inventory or financial posting, and never returns acquisition costs to ordinary catalog readers. Legacy optional Brand API fields and existing records remain supported.

Product reads include current `stock` quantities (`total`, `available`, `replaceable`, `reserved`, `sentToCompany`); purchase prices remain excluded. The frontend catalog is hosted at `/inventory`; `/products` is a legacy frontend redirect, while the product API routes remain unchanged.

The interface labels product types Product Category; API identifiers and `/product-types` remain unchanged. Product Categories are fixed and have no Add/Delete menu. Each category retains a Product Name menu with Add and confirmed Delete actions. `DELETE /categories/{id}` removes a Product Name link from one Product Category, accepting `{ "typeId": "<uuid>", "confirmed": true }`. It requires `catalog.write`, CSRF, and allowed Origin. A missing link returns 404; any active or inactive product using the same type/name pair returns 409. The transaction locks the name row, checks usage, removes only that link, and writes `PRODUCT_NAME_DELETED` audit metadata with `typeId` and name. Shared names, other category links, global name records, products, inventory, and history are preserved.

Implemented direct receiving: `GET /purchases/options` and `GET /purchases?page=1&pageSize=20` require `purchases.manage`. Options return active database products with their type/identity configuration, suppliers, and payment accounts. `POST /purchases/receive` requires `purchases.manage`, `inventory.receive`, session CSRF, allowed Origin, and a UUID `Idempotency-Key` header. The body contains `supplierId`, ISO `purchaseDate`, optional `reference`/`notes`, and `items` with `productId`, integer `quantity` (1–10000), decimal-string `unitPrice` (up to 14 integer digits and 2 decimals). Individually tracked items need an `identities` entry for every unit (at most 500 per purchase), with `serialNumber` and/or ISO `productionDate` according to the product configuration. Repeated production dates are valid; serial duplicates conflict. Quantity-tracked items omit identities. No discount is accepted.

Optional `paidAmount` defaults to `"0.00"`; positive payment needs `finance.write` and active asset `paymentAccountId`, and cannot exceed the purchase total. The transaction creates an immutable receipt with available stock, exact batch costs, movements, balanced inventory/payable journals, any initial payment/allocation, and audit. Failed validation or uniqueness checks roll everything back. Same-key same-body retries return the stored result with `Idempotency-Replayed: true`; altered-body retries conflict. The response includes purchase/receipt IDs, number, status, total, paid, due, and received quantity. Draft/partial receiving and reversal endpoints in the proposed contract above remain unimplemented.

Implemented supplier contacts: `GET /suppliers` and `POST /suppliers` require `parties.suppliers`; creation also requires the existing session CSRF token and allowed Origin. POST accepts `name` (trimmed, 1–160 characters), `phone` (6–30 characters, digits and telephone punctuation), optional `company` (up to 160 characters), and optional `address` (up to 500 characters). Omitted, blank, or null addresses are stored as null. Creation and its audit record commit atomically; no balances or stock are created. GET accepts `q`, `status=all|active|inactive`, `page` (starting at 1), and `pageSize` (1–100), returning contact-only `items`, filtered `total`, pagination, and total/active supplier counts.

Proposed draft-based partial receiving example (future endpoint, distinct from implemented direct receiving above):

```json
{
  "expectedVersion": 1,
  "receivedDate": "2026-11-12",
  "items": [{
    "purchaseItemId": "11111111-1111-4111-8111-111111111111",
    "quantity": "2",
    "batteryIdentities": [
      {"productionDate": "2026-10-01"},
      {"productionDate": "2026-10-01"}
    ]
  }]
}
```

For a production-date product, these are two valid distinct physical units. The API generates two unique internal codes. For parts, omit `batteryIdentities`; for SERIAL/BOTH send required serial/date values. Receiving over ordered remaining quantity is a conflict.

Sale drafts contain `customerId`, optional `vehicleId`/`batterySetId`, and items with `productId`, decimal quantity, selling price, discount, allowed warranty months, and exact battery IDs where applicable. Draft PATCH replaces the cart using `expectedVersion`. Confirmation takes only `expectedVersion` and initial payments; the server recalculates the draft and freezes values. Availability refresh does not substitute a different unit without user selection.

Customer payment POST supplies direction, customer, positive amount, method, and sale allocations. Supplier payments use supplier/purchase-receipt allocations. The party and every target must agree. An explicit `advance=true` permits unallocated balance; otherwise allocation totals equal payment amount. Currency is fixed BDT, never client-selectable.

Replacement receipt items supply claim ID, dispatch-item ID, and new serial/date/product identity. The supplier, current case state, predecessor, permitted product equivalence, valuation, and reservation customer are derived/verified server-side. Inspection and delivery accept no replacement customer override. Repeated supplier receipt with a new key conflicts via unique replacement-item linkage.

Detailed field schemas and required idempotency/CSRF headers for these commands are in the [OpenAPI contract](contracts/critical-commands.openapi.json). Future implementation must publish a complete generated OpenAPI document and verify it against this baseline.
