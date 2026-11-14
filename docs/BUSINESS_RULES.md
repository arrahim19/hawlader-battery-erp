# Business rules

Status: proposed implementation contract. Numbered rules are stable references for later code and tests. Policy defaults are explicit proposals, not statements of existing shop practice.

## Product and identity

- **CAT-01:** Create products before purchase/sale; product creation changes no stock, cash, payable, or revenue.
- **CAT-02:** A battery is tracked individually regardless of manufacturer identification. Each physical unit has a globally unique immutable internal ID. Production dates may repeat.
- **CAT-03:** SERIAL requires a serial, PRODUCTION_DATE requires a date, BOTH requires both. Normalize whitespace/case before uniqueness checks; preserve display values. Serial uniqueness is per product pending supplier confirmation.
- **CAT-04:** Active products are selectable in new documents. Deactivation preserves all history. Finalized historical transactions remain readable. Referenced tracking kind/base unit/identification method cannot change.
- **CAT-05:** Duplicate SKU or canonical product identity conflicts. Customers/suppliers with matching phone generate warnings; phones are not assumed unique identities.

## Stock and receiving

- **STK-01:** Only posted purchase receiving adds purchased inventory. Draft purchase edits and supplier payments do not add stock.
- **STK-02:** Each receipt records batch and actual unit acquisition cost. Discount and landed costs are allocated proportionally to net line value with deterministic rounding residuals assigned by line order. A zero-value purchase needs an explicit allocation basis, not division by zero. Freeze the plan before first receipt; allocate planned header costs over ordered quantities and reconcile final receipt residuals.
- **STK-03:** Partial receiving is allowed. Cumulative received quantity cannot exceed the order. Each battery quantity requires exactly that many identity entries. No receipt item can post twice, even with a different idempotency key.
- **STK-04:** A normal sale requires `condition=GOOD`, `custody=SHOP`, `ownership=SHOP`, `commercialState=AVAILABLE`, an active product, and no unresolved replacement/reservation. All predicates are rechecked at commit.
- **STK-05:** Marking an unsold unit replaceable changes it to FAULTY/UNAVAILABLE and creates the replacement case plus a movement atomically. No quantity is lost or duplicated.
- **STK-06:** Negative balance is forbidden. Battery-unit identity is indivisible. Parts use FIFO batch allocation with exact layer costs; selling more than eligible balance fails atomically.
- **STK-07:** Every custody, condition, disposition, or quantity change has a movement with actor and source. Ledger entries are immutable; corrections reverse them.
- **STK-08:** Opening stock and audited adjustments are exceptional controlled workflows, not product CRUD shortcuts. Opening imports require deduplication, approval, counts, and reconciled opening financial balances.

If 10 owned shop batteries exist and 2 are replaceable, the inventory summary is **10 accounted, 8 available, 2 replaceable**. After those 2 go to the supplier, it remains 10 accounted assets while on-hand is 8 and supplier-held is 2. A successor replaces its predecessor in active counts; both remain in history. Customer-owned warranty batteries are shown separately and never inflate shop-owned stock valuation.

## Sales and invoices

- **SAL-01:** Sale drafts do not deduct/reserve stock in the initial scope. A sale requires an identified customer; a quick customer form may precede it. Anonymous due/warranty sales are prohibited.
- **SAL-02:** Confirm one draft exactly once. Validate selected units belong to each product, IDs are distinct across lines, battery ID count equals quantity, vehicle/set belongs to the customer, and cart prices/discounts are authorized.
- **SAL-03:** Commit invoice, inventory movement, cost allocations, financial journals, initial payment/allocation, warranty snapshots, and audit together. Failures leave none of them partially posted.
- **SAL-04:** Set warranty per sale item, with unit-specific coverage snapshots. Staff may only choose allowed policy values; overrides require an explicit permission and reason. Store original start and expiry permanently.
- **SAL-05:** Discounts cannot make line net revenue negative. Allocate header discounts to lines before profit calculation. Selling below cost requires authorized override; the cost check stays server-side without revealing cost to sales staff.
- **SAL-06:** Cash, bKash, Nagad, Bank Transfer, and Other are recording methods. No payment-provider integration is implied. Multiple payment tenders may settle one invoice; all amounts must be positive.
- **SAL-07:** Applied payments may not exceed invoice due. Full/partial/unpaid status is derived from allocations less reversals, not editable flags. Excess receipts require an explicit separate customer advance workflow.
- **SAL-08:** Invoice snapshots include shop/address/phone, invoice/date/customer, items/units, vehicle/set if supplied, price/discount/totals, paid/due at issue, warranty dates and terms. Reprints retain original invoice content; current account balance is separately labeled.
- **SAL-09:** A4, 80mm, and PDF render the same committed data. Printing or retrying PDF generation changes no stock or payment.

## Warranty and replacements

- **REP-01:** Each case represents one old battery with source BEFORE_SALE or CUSTOMER_WARRANTY. Preserve old IDs/serials/costs and link new IDs; never turn replacement receiving into a purchase.
- **REP-02:** Before-sale cases select only eligible shop-owned available batteries. Create case, fault inspection, unavailable disposition, and movement in one transaction.
- **REP-03:** Customer claims identify the actual sold unit or delivered replacement descendant and original SaleUnit. Verify claimant, vehicle/set association if present, warranty, policy, and current custody. Customer reception records the receipt, inspection, case, and custody transfer together. Outside-warranty claims fail unless an authorized exception with reason is recorded.
- **REP-04:** Company dispatch requires an unresolved pending case, a matching supplier, and physical custody in shop. Multiple cases may share a challan. Dispatch all selected items atomically. Partial supplier receipt resolves only listed cases; unspecified cases stay outstanding.
- **REP-05:** Receiving a new unit requires a dispatched/reviewed case, unique new identity, matching product (or an authorized documented equivalent), and one successor per case. Equivalents must use the same tracking/base-unit model and explicitly map warranty/cost provenance. Confirm inspection before commercial release.
- **REP-06:** Before-sale success retires the predecessor and makes the inspected successor available, carrying forward its value. Customer success creates a CUSTOMER-owned, SHOP-held, RESERVED successor linked exclusively to that customer/claim. It cannot be sold through normal POS.
- **REP-07:** Customer delivery checks the reserved customer, recipient, case, and exact new unit. It changes custody to CUSTOMER, commercial state to SOLD, issues the delivery receipt, and completes the claim. It creates no sale revenue and no second original COGS.
- **REP-08:** Default replacement warranty ends at the original expiry. Do not silently restart it. A different supplier policy needs a versioned setting, explicit calculation, and audited snapshot. A failure on a replacement follows the original lineage; old claims are not rewritten.
- **REP-09:** Rejection records supplier decision without restoring availability. A rejected old unit is either returned to shop for inspection, returned to its customer, or disposed with authorization. BEFORE_SALE units stay unavailable unless inspected GOOD and explicitly released; customer-owned units can never be released into normal sales.
- **REP-10:** Rejected outcomes close only after custody/disposal/financial settlement is recorded. Replaced units and resolved rejected cases remain in history. Fees, transport, credits, and write-offs have explicit journal treatment; no automatic hidden expense or purchase.
- **REP-11:** No second unresolved case for the same physical unit. A rejected case awaiting return still blocks a new case. Received units that fail inspection remain quarantined; do not release them and quietly close the original case.

## Money and accounting

- **FIN-01:** Use decimal arithmetic; never JavaScript floating-point calculations for money. Compute exact intermediates, round posted BDT totals to 2 decimals, and assign deterministic residuals. Posted debits equal credits.
- **FIN-02:** Net sales revenue = posted sale amounts after discounts minus posted returns/credit reversals, excluding customer advances. COGS = actual battery acquisition cost or FIFO parts-layer cost, adjusted by return/reversal allocations. Gross profit = net revenue minus COGS. Net profit = gross profit minus operating/replacement expenses plus or minus recognized adjustments. Receipts are not revenue a second time.
- **FIN-03:** Receipt of goods: debit inventory, credit supplier payable for actual received net cost. Supplier payment: debit payable/advance, credit the chosen cash/bank/mobile-money account. Supplier due concerns received goods, not unreceived order commitments.
- **FIN-04:** Sale: debit customer receivable, credit net revenue; debit COGS, credit inventory. Customer payment: debit chosen asset account, credit receivable or advance. A full cash sale still uses these balanced postings in one transaction.
- **FIN-05:** Before-sale replacement transfers inventory value to the successor without gain/revenue/new purchase. Irrecoverable shop-owned scrap debits a loss/expense and credits inventory exactly once. Supplier credits reduce the related payable or create a recoverable balance with an explicit document.
- **FIN-06:** Cash balance means the cash-on-hand account only. bKash/Nagad/bank accounts are separate assets; dashboard cash received and total collections must have distinct labels.
- **FIN-07:** Customer receivable and supplier payable come from posted control-account entries, reconciled with allocations. Partial payments reduce due without changing original sale revenue, COGS, or invoice face total.
- **FIN-08:** Expenses use incurred date for profit reporting and settlement date for cash reporting. Posting an expense and paying it are linked so they do not count the expense twice. Date-range reporting uses Asia/Dhaka boundaries.
- **FIN-09:** No VAT/tax rate is invented. Tax is disabled in the initial model until required policy is confirmed; tax support must introduce explicit accounts, rates, rounding, and invoice fields before use.

Example: a unit with actual landed cost BDT 12,000 sells for BDT 14,000 after discount. Gross profit is BDT 2,000. If BDT 5,000 is collected, customer due is BDT 9,000. An operating expense of BDT 500 makes net profit BDT 1,500; it does not change invoice due. These are specification examples, not seeded operating data.

## Cancellation, returns, and corrections

- **COR-01:** Drafts may be edited or cancelled. Posted transactions cannot be hard-deleted or patched to different totals.
- **COR-02:** A finalized sale cancellation is a privileged reversal with reason, payment/refund settlement, original journal reversal, and exact returned unit/layer movements. It is allowed only when no unresolved claim, dependent delivery, or incompatible later allocation prevents safe reversal; otherwise use an explicit return/credit workflow.
- **COR-03:** Sales returns may be partial. Lock original allocations, prevent repeated returns, record physical inspection, and return inventory at original allocated cost. Faulty returns stay unavailable. Customer refund/credit and any advance remain separately traceable.
- **COR-04:** Cancel unreceived purchase remainder without changing received stock. A posted receipt with downstream consumption cannot be simply cancelled; use a controlled supplier return and valuation adjustment. Initial implementation may reject unsupported correction cases instead of inventing destructive behavior.
- **COR-05:** Posted payment/expense reversal appends a linked reversing journal and allocation reversals. Prevent duplicate reversal and reject closed-period edits if period controls are enabled. Corrections require audit reason and authorization.

## Permissions

Backend permissions are independent codes. This is the initial role assignment, configurable by Owner with audit. Owner cannot bypass invariants.

| Capability / permission | Owner | Manager | Sales staff | Inventory staff |
| --- | --- | --- | --- | --- |
| Operational dashboard `dashboard.read` | Yes | Yes | Yes, filtered | Yes, filtered |
| Catalog read `catalog.read` | Yes | Yes | Yes, no costs | Yes, no costs |
| Catalog write `catalog.write` | Yes | Yes | No | No |
| Parties read/write `parties.read/write` | Yes | Yes | Customers only | Supplier contact only |
| Purchase costs and purchase posting `purchases.manage` | Yes | Yes | No | No |
| Receiving `inventory.receive` | Yes | Yes | No | Yes, cost-redacted DTO |
| Stock read `inventory.read` | Yes | Yes | Yes | Yes |
| Audited stock adjustment `inventory.adjust` | Yes | No by default | No | No |
| POS and customer receipts `sales.manage`, `payments.customer` | Yes | Yes | Yes | No |
| Discounts within configured ceiling `sales.discount` | Yes | Yes | Yes | No |
| Below-cost / warranty override `sales.override`, `warranty.override` | Yes | Explicit grant | No | No |
| Cancellation / financial reversal `transactions.reverse` | Yes | Explicit grant | No | No |
| Claims intake `replacements.intake` | Yes | Yes | Yes | Yes |
| Dispatch/receipt/delivery `replacements.manage` | Yes | Yes | Delivery only | Yes |
| Customer balances `customers.accounts.read` | Yes | Yes | Yes | No |
| Supplier payment/expense `finance.write` | Yes | Explicit grant | No | No |
| Cost, profit, finance reports `finance.read` | Yes | Yes | No | No |
| Operational exports `reports.operational` | Yes | Yes | Sales scope | Stock/claim scope |
| Users/roles, settings, audit `access.manage`, `settings.manage`, `audit.read` | Yes | No by default | No | No |

Implementation splits customer versus supplier parties, and intake/dispatch/receipt/delivery into separate permission codes where this table limits scope. Receiving DTOs expose order quantities and identifiers without supplier costs. Finance-read alone does not confer write authority.

## Reliability and audit

- **SYS-01:** Inventory and money-changing commands require idempotency keys, unique posting sources, transactions, and concurrency-safe guards. A new key cannot post an already finalized source again.
- **SYS-02:** Same key and canonical request replays original result; changed body or target conflicts. Hash covers method, route/target IDs, normalized body and semantic headers. Replays still require current authentication/authorization. Never replay another actor's sensitive response.
- **SYS-03:** Failed commands produce structured errors and no partial balances/movements/journals. External PDF/storage failures happen after business commit and can be retried independently.
- **SYS-04:** Store timestamps consistently and present business dates in Asia/Dhaka. Never calculate today's reports from server-local timezone or browser-local timezone.
- **SYS-05:** Real dashboard/report calculations use only posted records from the configured database. Synthetic fixtures exist only in isolated tests/development and must never silently replace an unavailable live database.
