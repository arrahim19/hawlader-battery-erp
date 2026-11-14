"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  List,
  LoaderCircle,
  PackageOpen,
  Plus,
  RotateCcw,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  ModuleTabs,
  Panel,
  SummaryRows,
} from "@/components/reference-ui";
import { useSession } from "@/components/session-provider";
import {
  post,
  type CompletedSale,
  type CustomerRecord,
  type SalesList,
  type SalesOptions,
} from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { todayInDhaka } from "@/lib/use-dashboard";
import { cents, decimalAmount } from "@/lib/purchase-amounts";
import { money } from "@/lib/utils";
import { CustomerForm } from "./customer-form";
import { TransactionView } from "./transaction-view";

type SaleLine = {
  productId: string;
  name: string;
  typeName: string;
  quantity: number;
  unitPrice: string;
  batteryUnitIds?: string[];
  identities: string[];
};
const validPrice = (value: string) => /^\d{1,14}(?:\.\d{1,2})?$/.test(value);

export function SalesView({
  preview = false,
  view = "",
  loading = false,
  moduleError = "",
  initialCustomerId = "",
}: {
  preview?: boolean;
  view?: string;
  loading?: boolean;
  moduleError?: string;
  initialCustomerId?: string;
}) {
  const user = useSession();
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const current = ["list", "returns", "collections", "reports"].includes(view)
    ? view
    : "new";
  const options = useCatalogResource<SalesOptions>(
    !preview && !loading && current === "new" ? "/sales/options" : null,
    revision,
  );
  const listing = useCatalogResource<SalesList>(
    !preview && !loading && current === "list"
      ? `/sales?page=${page}&pageSize=20`
      : null,
    revision,
  );
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [createdCustomers, setCreatedCustomers] = useState<CustomerRecord[]>(
    [],
  );
  const [customerOpen, setCustomerOpen] = useState(false);
  const [saleDate, setSaleDate] = useState(todayInDhaka);
  const [typeId, setTypeId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [cart, setCart] = useState<SaleLine[]>([]);
  const canPay =
    preview ||
    Boolean(
      user?.permissions.some((permission) =>
        ["finance.write", "payments.customer"].includes(permission),
      ),
    );
  const [saleType, setSaleType] = useState(canPay ? "cash" : "credit");
  const [partialPaid, setPartialPaid] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<CompletedSale | null>(null);
  const submission = useRef<{ signature: string; key: string } | null>(null);
  const customers = [
    ...new Map(
      [...(options.data?.customers ?? []), ...createdCustomers].map(
        (customer) => [customer.id, customer],
      ),
    ).values(),
  ];
  const customer = customers.find((item) => item.id === customerId);
  const products =
    options.data?.products.filter((item) => item.type.id === typeId) ?? [];
  const product = products.find((item) => item.id === productId);
  const battery = product?.type.trackingKind === "BATTERY_UNIT";
  const count = /^\d+$/.test(quantity) ? Number(quantity) : 0;
  const validQuantity =
    Number.isSafeInteger(count) && count >= 1 && count <= 10000;
  const totalCents = cart.reduce(
    (sum, line) => sum + cents(line.unitPrice) * BigInt(line.quantity),
    BigInt(0),
  );
  const total = decimalAmount(totalCents);
  const lineTotal = validQuantity
    ? decimalAmount(cents(unitPrice) * BigInt(count))
    : "0.00";
  const paid = saleType === "cash" ? total : partialPaid || "0.00";
  const due = decimalAmount(totalCents - cents(paid));
  const busy = loading || options.loading;
  const loadError = options.error || listing.error || moduleError;
  const pages = Math.max(
    1,
    Math.ceil((listing.data?.total ?? 0) / (listing.data?.pageSize ?? 20)),
  );

  function resetEntry() {
    setProductId("");
    setQuantity("1");
    setUnitPrice("");
    setUnitIds([]);
  }
  function addLine() {
    setError("");
    if (!product || !validQuantity || !validPrice(unitPrice)) {
      setError("পণ্য, সঠিক quantity ও unit price দিন।");
      return;
    }
    if (count > Number(product.availableQuantity)) {
      setError("বিক্রয়যোগ্য স্টকের চেয়ে বেশি quantity দেওয়া যাবে না।");
      return;
    }
    if (cart.some((line) => line.productId === product.id)) {
      setError("পণ্যটি cart-এ আছে। পরিবর্তনের জন্য আগের লাইন সরিয়ে আবার যোগ করুন।");
      return;
    }
    if (battery && unitIds.length !== count) {
      setError(`এই বিক্রয়ের জন্য ${count}টি battery unit বাছাই করুন।`);
      return;
    }
    setCart((lines) => [
      ...lines,
      {
        productId: product.id,
        name: product.name,
        typeName: product.type.name,
        quantity: count,
        unitPrice: decimalAmount(cents(unitPrice)),
        ...(battery ? { batteryUnitIds: unitIds } : {}),
        identities: battery
          ? product.units
              .filter((unit) => unitIds.includes(unit.id))
              .map(
                (unit) => unit.serialNumber || unit.productionDate || unit.id,
              )
          : [],
      },
    ]);
    resetEntry();
    setCompleted(null);
  }
  async function completeSale(event: FormEvent) {
    event.preventDefault();
    if (preview || saving) return;
    setError("");
    if (!customer || !cart.length) {
      setError("একজন customer এবং বিক্রয়ের জন্য অন্তত একটি পণ্য বাছাই করুন।");
      return;
    }
    if (!validPrice(paid) || cents(paid) > totalCents) {
      setError("পরিশোধের পরিমাণ মোট বিক্রয়মূল্যের মধ্যে হতে হবে।");
      return;
    }
    const account = paymentAccountId || options.data?.paymentAccounts[0]?.id;
    if (cents(paid) > BigInt(0) && (!canPay || !account)) {
      setError("পেমেন্ট গ্রহণের জন্য একটি অনুমোদিত payment method বাছাই করুন।");
      return;
    }
    const body = {
      customerId,
      saleDate,
      notes,
      items: cart.map(({ productId, quantity, unitPrice, batteryUnitIds }) => ({
        productId,
        quantity,
        unitPrice,
        ...(batteryUnitIds ? { batteryUnitIds } : {}),
      })),
      paidAmount: decimalAmount(cents(paid)),
      ...(cents(paid) > BigInt(0) ? { paymentAccountId: account } : {}),
    };
    const signature = JSON.stringify(body);
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    setSaving(true);
    try {
      const result = await post<CompletedSale>("/sales/complete", body, {
        "Idempotency-Key": submission.current.key,
      });
      setCompleted(result);
      setCart([]);
      resetEntry();
      setPartialPaid("");
      setNotes("");
      submission.current = null;
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "বিক্রয় সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setSaving(false);
    }
  }
  if (!["new", "list"].includes(current))
    return (
      <TransactionView purchase={false} preview={preview} view={current} />
    );

  return (
    <div className="sales-workspace" aria-busy={busy || listing.loading}>
      <ModuleTabs
        moduleId="sales"
        current={current}
        preview={preview}
        items={[
          { id: "new", label: "New Sale", icon: ShoppingCart },
          { id: "list", label: "Sales List", icon: List },
          { id: "returns", label: "Sales Return", icon: RotateCcw },
          { id: "collections", label: "Due Collections", icon: ClipboardList },
          { id: "reports", label: "Sales Report", icon: FileText },
        ]}
      />
      <div className="sales-notices">
        {error || loadError ? (
          <div role="alert" className="sales-error">
            <span>{error || loadError}</span>
            {options.error || listing.error ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRevision((value) => value + 1)}
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {completed ? (
          <div role="status" className="sales-success">
            <Check size={18} />
            <span>
              বিক্রয় সংরক্ষিত হয়েছে · {completed.invoiceNumber} · মোট{" "}
              {money(completed.total)} · বকেয়া {money(completed.due)}
            </span>
            <Link href="/sales/list">Sales List দেখুন</Link>
          </div>
        ) : null}
      </div>
      {current === "list" ? (
        <Panel title="Sales List" className="sales-list-panel">
          <div className="erp-table-wrap">
            <table className="erp-table">
              <caption className="sr-only">Sales</caption>
              <thead>
                <tr>
                  {[
                    "Invoice",
                    "Date",
                    "Customer",
                    "Items",
                    "Qty",
                    "Total",
                    "Paid",
                    "Due",
                    "Status",
                  ].map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listing.data?.items.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.invoiceNumber || "—"}</td>
                    <td>{sale.saleDate || "—"}</td>
                    <td>
                      {sale.customer.name}
                      <small className="block text-slate-500">
                        {sale.customer.phone}
                      </small>
                    </td>
                    <td>{sale.itemCount}</td>
                    <td>{sale.quantity}</td>
                    <td>{money(sale.total)}</td>
                    <td>{money(sale.paid)}</td>
                    <td>{money(sale.due)}</td>
                    <td>{sale.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!listing.data?.items.length ? (
            <div className="erp-empty" role="status">
              <PackageOpen />
              <p>
                {loading || listing.loading
                  ? "Loading sales..."
                  : listing.error
                    ? "Unable to load sales"
                    : "No records to display"}
              </p>
              <span>নিশ্চিত বিক্রয় এই তালিকায় দেখা যাবে।</span>
            </div>
          ) : null}
          <div className="erp-pager">
            <span>
              Page {page} / {pages}
            </span>
            <div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous sales page"
                disabled={page <= 1 || listing.loading}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next sales page"
                disabled={page >= pages || listing.loading}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <form onSubmit={completeSale} className="sales-form">
          <fieldset
            disabled={saving || busy || Boolean(moduleError)}
            className="sales-fieldset"
          >
            <legend className="sr-only">Sales details</legend>
            <div className="sales-layout">
              <div className="sales-main">
                <Panel
                  title="Customer & Invoice"
                  className="sales-customer-panel"
                >
                  <div className="erp-form-body">
                    <div className="sales-customer-fields">
                      <div className="erp-inline-field">
                        <Field label="Customer" required>
                          <select
                            aria-label="Select customer"
                            value={customerId}
                            onChange={(event) =>
                              setCustomerId(event.target.value)
                            }
                            required
                          >
                            <option value="">কাস্টমার নির্বাচন করুন</option>
                            {customers.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} · {item.phone}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCustomerOpen(true)}
                        >
                          <Plus />
                          New Customer
                        </Button>
                      </div>
                      <Field label="Invoice Date" required>
                        <input
                          type="date"
                          aria-label="Sale date"
                          value={saleDate}
                          onChange={(event) => setSaleDate(event.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Invoice No">
                        <input
                          readOnly
                          value={completed?.invoiceNumber ?? ""}
                          placeholder="বিক্রয় নিশ্চিত করার পর তৈরি হবে"
                        />
                      </Field>
                    </div>
                    <p className="sales-customer-contact">
                      {customer
                        ? [
                            customer.phone,
                            customer.address,
                            customer.vehicles
                              .map((vehicle) =>
                                [vehicle.type, vehicle.identifier]
                                  .filter(Boolean)
                                  .join(" · "),
                              )
                              .join(", "),
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "পুরোনো কাস্টমার বাছুন অথবা নতুন কাস্টমারের তথ্য দিন।"}
                    </p>
                  </div>
                </Panel>
                <Panel title="Add Products" className="sales-products-panel">
                  <div className="erp-form-body">
                    <div className="sales-product-fields">
                      <Field
                        label="Product Category"
                        className="sales-type-field"
                      >
                        <select
                          aria-label="Sales product category"
                          value={typeId}
                          disabled={!options.data?.types.length}
                          onChange={(event) => {
                            setTypeId(event.target.value);
                            resetEntry();
                            setError("");
                          }}
                        >
                          <option value="">ক্যাটাগরি নির্বাচন করুন</option>
                          {options.data?.types.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Product" className="sales-product-field">
                        <select
                          aria-label="Sales product"
                          value={productId}
                          disabled={!typeId || !products.length}
                          onChange={(event) => {
                            const selected = products.find(
                              (item) => item.id === event.target.value,
                            );
                            setProductId(event.target.value);
                            setQuantity("1");
                            setUnitPrice(selected?.defaultSellingPrice ?? "");
                            setUnitIds([]);
                            setError("");
                          }}
                        >
                          <option value="">
                            {!typeId
                              ? "আগে ক্যাটাগরি নির্বাচন করুন"
                              : !products.length
                                ? "এই ক্যাটাগরিতে কোনো পণ্য নেই"
                                : "পণ্য নির্বাচন করুন"}
                          </option>
                          {products.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                              {item.model ? " · " + item.model : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Qty" className="sales-qty-field">
                        <input
                          aria-label="Sales quantity"
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          value={quantity}
                          onChange={(event) => {
                            setQuantity(event.target.value);
                            setUnitIds([]);
                          }}
                        />
                      </Field>
                      <Field
                        label="Unit Price (৳)"
                        className="sales-price-field"
                      >
                        <input
                          aria-label="Unit sale price"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={unitPrice}
                          onChange={(event) => setUnitPrice(event.target.value)}
                        />
                      </Field>
                      <Field label="Total (৳)" className="sales-total-field">
                        <input
                          aria-label="Sales line total"
                          readOnly
                          value={decimalAmount(cents(lineTotal))}
                        />
                      </Field>
                      <Button
                        type="button"
                        onClick={addLine}
                        disabled={
                          !product || Number(product.availableQuantity) <= 0
                        }
                      >
                        <Plus />
                        Add to Sale
                      </Button>
                    </div>
                    <p className="sales-stock-hint">
                      {product
                        ? `বিক্রয়যোগ্য স্টক: ${product.availableQuantity} ${product.unit}`
                        : "ক্যাটাগরি ও পণ্য বাছাই করে quantity এবং unit price দিন।"}
                    </p>
                    <div className="sales-unit-area">
                      {battery ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setUnitsOpen(true)}
                          aria-label="Select Battery Units"
                        >
                          Battery Units · নির্বাচিত {unitIds.length} /{" "}
                          {validQuantity ? count : 0}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Panel>
                <Panel
                  title="Sale Items"
                  className="sales-cart-panel"
                  action={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!cart.length}
                      onClick={() => {
                        setCart([]);
                        setPartialPaid("");
                        setError("");
                      }}
                    >
                      <Trash2 />
                      Clear All
                    </Button>
                  }
                >
                  <div className="sales-cart-body">
                    <div className="erp-table-wrap">
                      <table className="erp-table">
                        <caption className="sr-only">Sale items</caption>
                        <colgroup>
                          {[27, 23, 8, 15, 17, 10].map((width, index) => (
                            <col key={index} style={{ width: `${width}%` }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            {[
                              "Product",
                              "Serial / Identification",
                              "Qty",
                              "Unit Price (৳)",
                              "Total (৳)",
                              "Action",
                            ].map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cart.map((line) => (
                            <tr key={line.productId}>
                              <td>
                                {line.name}
                                <small className="block text-slate-500">
                                  {line.typeName}
                                </small>
                              </td>
                              <td>{line.identities.join(", ") || "—"}</td>
                              <td>{line.quantity}</td>
                              <td>{money(line.unitPrice)}</td>
                              <td>
                                {money(
                                  decimalAmount(
                                    cents(line.unitPrice) *
                                      BigInt(line.quantity),
                                  ),
                                )}
                              </td>
                              <td>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Remove ${line.name}`}
                                  onClick={() =>
                                    setCart((lines) =>
                                      lines.filter(
                                        (item) =>
                                          item.productId !== line.productId,
                                      ),
                                    )
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!cart.length ? (
                      <div className="erp-empty sales-cart-empty">
                        <PackageOpen />
                        <p>কোনো পণ্য যোগ করা হয়নি</p>
                        <span>
                          পণ্য, quantity ও unit price দিয়ে Add to Sale চাপুন।
                        </span>
                      </div>
                    ) : null}
                  </div>
                </Panel>
                <Panel title="Remark (Optional)">
                  <div className="erp-form-body">
                    <Field label="Sale notes" className="[&>span]:sr-only">
                      <textarea
                        aria-label="Sale notes"
                        value={notes}
                        maxLength={2000}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="বিক্রয় সংক্রান্ত কোনো নোট..."
                      />
                    </Field>
                  </div>
                </Panel>
              </div>
              <aside className="sales-side">
                <Panel>
                  <h2 className="erp-summary-title">
                    <ShoppingCart size={24} />
                    Sales Summary
                  </h2>
                  <SummaryRows
                    rows={[
                      ["Total Items", String(cart.length)],
                      [
                        "Total Quantity",
                        String(
                          cart.reduce((sum, line) => sum + line.quantity, 0),
                        ),
                      ],
                      ["Subtotal", money(total)],
                    ]}
                  />
                  <div className="erp-summary-total">
                    <span>Grand Total</span>
                    <span>{money(total)}</span>
                  </div>
                </Panel>
                <Panel title="Payment" icon={CreditCard}>
                  <div className="erp-form-body sales-payment-fields">
                    <Field label="Sales Type">
                      <select
                        aria-label="Sales type"
                        value={saleType}
                        onChange={(event) => {
                          setSaleType(event.target.value);
                          setPartialPaid("");
                        }}
                      >
                        <option value="cash" disabled={!canPay}>
                          Cash · Full Payment
                        </option>
                        <option value="credit">Credit · Partial / Due</option>
                      </select>
                    </Field>
                    <Field label="Paid Amount (৳)">
                      <input
                        aria-label="Sales paid amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={paid}
                        readOnly={saleType === "cash" || !canPay}
                        onChange={(event) => setPartialPaid(event.target.value)}
                      />
                    </Field>
                    <Field label="Payment Method">
                      <select
                        aria-label="Sales payment method"
                        value={
                          paymentAccountId ||
                          options.data?.paymentAccounts[0]?.id ||
                          ""
                        }
                        disabled={!canPay || cents(paid) === BigInt(0)}
                        onChange={(event) =>
                          setPaymentAccountId(event.target.value)
                        }
                      >
                        <option value="">পেমেন্ট পদ্ধতি নির্বাচন করুন</option>
                        {options.data?.paymentAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </Panel>
                <Panel>
                  <div className="erp-summary-total sales-due">
                    <span>Due Amount</span>
                    <span>{money(due)}</span>
                  </div>
                  <p className="sales-due-hint">
                    বিক্রয় নিশ্চিত হলে বকেয়া নির্বাচিত customer-এর হিসাবে যুক্ত হবে।
                  </p>
                </Panel>
              </aside>
            </div>
          </fieldset>
          <div className="sales-actions">
            <span>
              {preview
                ? "UI preview: লগইন ছাড়া বিক্রয় সংরক্ষিত হবে না।"
                : "নিশ্চিত করলে stock ও customer-এর হিসাব আপডেট হবে।"}
            </span>
            <Button
              type="submit"
              className="erp-button"
              disabled={
                preview ||
                saving ||
                busy ||
                !customer ||
                !cart.length ||
                Boolean(moduleError)
              }
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
              {saving ? "Saving Sale..." : "Complete Sale"}
            </Button>
          </div>
        </form>
      )}
      <Dialog.Root open={customerOpen} onOpenChange={setCustomerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
          <Dialog.Content className="feature-dialog sales-customer-dialog">
            <Dialog.Title className="text-xl font-bold">
              New Customer
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-slate-500">
              Customer-এর যোগাযোগ ও গাড়ির তথ্য দিন। সংরক্ষণ করলে এই বিক্রয়ে
              নির্বাচিত হবে।
            </Dialog.Description>
            <div className="mt-5">
              <CustomerForm
                preview={preview}
                onSaved={(created) => {
                  setCreatedCustomers((items) => [...items, created]);
                  setCustomerId(created.id);
                  setCustomerOpen(false);
                }}
              />
            </div>
            <Dialog.Close
              aria-label="Close customer dialog"
              className="absolute top-4 right-4"
            >
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={unitsOpen} onOpenChange={setUnitsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
          <Dialog.Content className="feature-dialog sales-units-dialog">
            <Dialog.Title className="text-xl font-bold">
              Select Battery Units
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-slate-500">
              {product?.name} · নির্বাচিত {unitIds.length} /{" "}
              {validQuantity ? count : 0}
            </Dialog.Description>
            <fieldset
              className="sales-unit-picker"
              aria-label="Sale battery units"
            >
              <legend className="sr-only">Available battery units</legend>
              {product?.units.length ? (
                <div>
                  {product.units.map((unit) => (
                    <label key={unit.id}>
                      <input
                        type="checkbox"
                        value={unit.id}
                        checked={unitIds.includes(unit.id)}
                        disabled={
                          !unitIds.includes(unit.id) && unitIds.length >= count
                        }
                        onChange={(event) =>
                          setUnitIds((selected) =>
                            event.target.checked
                              ? [...selected, unit.id]
                              : selected.filter((id) => id !== unit.id),
                          )
                        }
                      />
                      <span>
                        {unit.serialNumber || unit.productionDate || unit.id}
                        {unit.serialNumber && unit.productionDate
                          ? " · " + unit.productionDate
                          : ""}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p>বিক্রয়যোগ্য battery unit নেই।</p>
              )}
            </fieldset>
            <div className="mt-4 flex justify-end">
              <Dialog.Close asChild>
                <Button type="button">Done</Button>
              </Dialog.Close>
            </div>
            <Dialog.Close
              aria-label="Close battery unit selection"
              className="absolute top-4 right-4"
            >
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
