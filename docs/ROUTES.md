# Modules and page hierarchy

Status: proposed Next.js App Router hierarchy. Paths are user-facing; route groups `(auth)` and `(app)` do not appear in URLs. All business pages require a session and permission-filtered server data.

Phase 2 update: `/login`, `/preview`, `/dashboard` and all listed module roots now render. A `(workspace)` route group replaces the proposed `(app)` name without changing URLs. Nested module paths currently render a clearly labeled foundation page through a catch-all; they do not implement business forms or posting. See [PHASE_2.md](PHASE_2.md).

| Sidebar module | Pages and actions |
| --- | --- |
| Dashboard | `/dashboard`: Dhaka date filters, permission-filtered metrics/charts, recent sales, low stock and replacement alerts |
| Products | `/products`, `/products/new`, `/products/[id]`, `/products/[id]/edit`; tabs/links `/products/types`, `/products/brands`, `/products/categories` |
| Purchase | `/purchases`, `/purchases/new`, `/purchases/[id]`, `/purchases/[id]/edit`, `/purchases/[id]/receive`, `/purchases/receipts/[id]` |
| Inventory / Stock | `/inventory`, `/inventory/batteries/[id]` timeline, `/inventory/movements`, `/inventory/adjustments`, `/inventory/adjustments/new` |
| Sales / POS | `/sales` with prominent New Sale, `/sales/new`, `/sales/[id]`, `/sales/[id]/returns/new`, `/sales/[id]/print?format=a4` or `thermal80` |
| Replacement Management | `/replacements`, `/replacements/new` source picker, `/replacements/[id]`, `/replacements/dispatches`, `/replacements/dispatches/new`, `/replacements/receipts/new`, `/replacements/[id]/deliver` |
| Customers | `/customers`, `/customers/new`, `/customers/[id]`, `/customers/[id]/edit`; tabs for invoices, account, warranty history |
| Suppliers | `/suppliers`, `/suppliers/new`, `/suppliers/[id]`, `/suppliers/[id]/edit`; tabs for purchases, payments, dispatches, outstanding replacements |
| Accounts & Expenses | `/accounts`, `/accounts/payments`, `/accounts/payments/new`, `/accounts/expenses`, `/accounts/expenses/new`, `/accounts/journals` (restricted) |
| Reports | `/reports/sales`, `/reports/purchases`, `/reports/inventory`, `/reports/replacements`, `/reports/receivables`, `/reports/payables`, `/reports/profit-loss`, `/reports/cash` |
| Users & Permissions | `/users`, `/users/new`, `/users/[id]`, `/users/roles`; session revocation and password reset actions |
| Settings | `/settings/shop`, `/settings/invoices`, `/settings/warranty`, `/settings/payment-methods`, `/settings/audit` |

Other routes: `/` redirects to `/dashboard` for authenticated users, otherwise `/login`; `/login`, `/account` for own password/session management; claim and delivery receipt print views under `/replacements/[id]/print?kind=claim|delivery|rejection`.

## Shared layout and interaction rules

- Left sidebar groups daily selling, stock, parties, accounts, and administration. Show only allowed destinations; opening a restricted URL must still fail server authorization.
- Top header shows shop name, business date, scoped search, current user/role, and account menu. Global search is permission-filtered by customer phone, invoice, product, serial, or internal battery ID.
- Tables support search, page size, pagination, sortable safe columns, visible filter chips, loading skeletons, empty/no-results states, and retryable error states. Persist filter query parameters for back navigation.
- Confirmation dialogs identify exact document/units, due/payment, and irreversible posting consequences. Disable duplicate submission for usability; server idempotency remains mandatory.
- Forms show field-level Zod errors and map server DTO errors to fields. Toasts announce success/failure, while inline errors preserve entered values. Never show a success toast before commit.
- BDT uses `৳` with consistent two-decimal totals; dates show Asia/Dhaka explicitly where ambiguity matters. Product units remain visible in every quantity field.
- Mobile layouts preserve essential columns using stacked rows and an accessible details action. Do not force employees to edit wide financial tables on a phone.

## Critical screen workflows

New purchase: select supplier, existing products, quantities/prices/discount/cost plan, save draft, then enter identities on receiving. The draft summary clearly says stock has not been received. Receiving users without cost permission see only operational fields.

New sale: choose/create customer, select a battery set optionally, search products and eligible stock, select each battery ID, review quantities/prices/discount/policy, enter one or more payment tenders, review and confirm. Show server-authoritative final invoice after commit, with separate print/PDF actions. Conflicted unit selection refreshes availability without discarding the cart.

Replacement intake: choose unsold stock or customer warranty source. Customer search supports phone/invoice/battery ID; show individual units in a set, original expiry, prior replacement lineage, complaint and test results. Show the claim receipt after successful intake.

Replacement board: filter by source/supplier/status/age, select pending units for a challan, receive a subset of dispatched claims, inspect successors, and deliver customer-reserved units only to the linked customer. A rejected claim shows both supplier decision and outstanding physical return.

Dashboard shows today's sales, received purchase value, physical cash receipts, other collections, receivables/payables, eligible stock, low-stock alerts, pending claims, supplier-held units, received replacements, and recent invoices. Hide cost/profit/payables metrics at the API level where permission is missing; never substitute fake figures.
