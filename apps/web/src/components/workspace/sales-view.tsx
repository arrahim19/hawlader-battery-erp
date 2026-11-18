"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { Dialog } from "radix-ui";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Eye,
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
import { notifyDashboardUpdate } from "@/lib/use-dashboard";
import { useBusinessDate } from "@/lib/use-business-date";
import { cents, decimalAmount } from "@/lib/purchase-amounts";
import { money } from "@/lib/utils";
import { CustomerSalesHistoryDialog } from "./customer-sales-history";
import { CustomerForm } from "./customer-form";
import { TransactionView } from "./transaction-view";
import { TransactionDeleteButton } from "./transaction-delete-button";

import {
  SaleProductEntry,
  blankSaleEntry,
  type SaleEntry,
} from "./sale-product-entry";

type SaleLine = {
  entryId?: string;
  productId: string;
  name: string;
  typeName: string;
  quantity: number;
  unitPrice: string;
  model: string;
};
const validPrice = (value: string) => /^\d{1,14}(?:\.\d{1,2})?$/.test(value);

function RecentSales({
  data,
  loading,
  error,
  page,
  pages,
  onPage,
  bodyRef,
  onDeleted,
  preview,
}: {
  data: SalesList | null;
  loading: boolean;
  error: string;
  page: number;
  pages: number;
  onPage: (page: number) => void;
  bodyRef: RefObject<HTMLDivElement | null>;
  onDeleted: (id: string) => void;
  preview: boolean;
}) {
  const [details, setDetails] = useState<SalesList["items"][number] | null>(
    null,
  );
  const detailsButton = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <div className="sales-cart-body sales-history-body" ref={bodyRef}>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <caption className="sr-only">Recent sales</caption>
            <colgroup>
              {[15, 11, 19, 5, 11, 11, 11, 12, 5].map((width, index) => (
                <col key={index} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  "Invoice",
                  "Date",
                  "Customer",
                  "Qty",
                  "Total (৳)",
                  "Paid (৳)",
                  "Due (৳)",
                  "Details",
                  "Action",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((sale) => (
                <tr key={sale.id}>
                  <td title={sale.invoiceNumber ?? undefined}>
                    {sale.invoiceNumber || "—"}
                  </td>
                  <td>{sale.saleDate || "—"}</td>
                  <td>
                    {sale.customer.name}
                    <small className="block text-slate-500">
                      {sale.customer.phone}
                    </small>
                  </td>
                  <td>{sale.quantity}</td>
                  <td>{money(sale.total)}</td>
                  <td>{money(sale.paid)}</td>
                  <td>{money(sale.due)}</td>
                  <td>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Details"
                      title={`Details — ${sale.invoiceNumber ?? sale.id}`}
                      onClick={(event) => {
                        detailsButton.current = event.currentTarget;
                        setDetails(sale);
                      }}
                    >
                      <Eye />
                    </Button>
                  </td>
                  <td>
                    <TransactionDeleteButton
                      kind="sales"
                      id={sale.id}
                      label={sale.invoiceNumber || sale.id}
                      preview={preview}
                      onDeleted={() => onDeleted(sale.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.items.length ? (
          <div className="erp-empty sales-cart-empty" role="status">
            <PackageOpen />
            <p>
              {loading
                ? "Loading sales..."
                : error
                  ? "Unable to load sales"
                  : "No confirmed sales yet"}
            </p>
            <span>নিশ্চিত বিক্রয় এখানে দেখা যাবে।</span>
          </div>
        ) : null}
      </div>
      <div className="erp-pager sales-items-pager">
        <span>
          {data?.total ?? 0} sales · Page {page} / {pages}
        </span>
        <div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous recent sales page"
            disabled={loading || page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next recent sales page"
            disabled={loading || page >= pages}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      {details ? (
        <CustomerSalesHistoryDialog
          key={details.id}
          customer={details.customer}
          sale={details}
          preview={preview}
          onClose={() => setDetails(null)}
          returnFocus={() => detailsButton.current?.focus()}
        />
      ) : null}
    </>
  );
}

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
  const [itemsPerPage, setItemsPerPage] = useState(3);
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = ["list", "returns", "collections", "reports"].includes(view)
    ? view
    : "new";
  const options = useCatalogResource<SalesOptions>(
    !preview && !loading && current === "new" ? "/sales/options" : null,
    revision,
  );
  const listing = useCatalogResource<SalesList>(
    !preview && !loading && ["new", "list"].includes(current)
      ? `/sales?page=${page}&pageSize=${current === "new" ? itemsPerPage : 20}`
      : null,
    revision,
  );
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [createdCustomers, setCreatedCustomers] = useState<CustomerRecord[]>(
    [],
  );
  const [customerOpen, setCustomerOpen] = useState(false);
  const today = useBusinessDate();
  const [saleDateValue, setSaleDate] = useState<string | null>(null);
  const saleDate = saleDateValue ?? today;
  const [entries, setEntries] = useState<SaleEntry[]>([
    blankSaleEntry("entry-0"),
  ]);
  const entrySequence = useRef(1);
  const entryList = useRef<HTMLDivElement>(null);
  const canPay =
    preview ||
    Boolean(
      user?.permissions.some((permission) =>
        ["finance.write", "payments.customer"].includes(permission),
      ),
    );
  const [saleType, setSaleType] = useState("cash");
  const [partialPaid, setPartialPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [mobilePanel, setMobilePanel] = useState("details");
  const [itemsPage, setItemsPage] = useState(1);
  const cartBody = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<
    (CompletedSale & { items: SaleLine[] }) | null
  >(null);
  const cart: SaleLine[] = entries.flatMap((entry) => {
    const product = options.data?.products.find(
      (product) =>
        product.id === entry.productId && product.type.id === entry.typeId,
    );
    const quantity = /^\d+$/.test(entry.quantity) ? Number(entry.quantity) : 0;
    if (
      !product ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 10000 ||
      !validPrice(entry.unitPrice)
    )
      return [];
    return [
      {
        entryId: entry.id,
        productId: product.id,
        name: product.name,
        typeName: product.type.name,
        quantity,
        unitPrice: decimalAmount(cents(entry.unitPrice)),
        model: product.model,
      },
    ];
  });
  const displayedItems = completed?.items ?? cart;
  const showHistory = historyOpen || displayedItems.length === 0;
  const itemPages = Math.max(
    1,
    Math.ceil(displayedItems.length / itemsPerPage),
  );
  const currentItemsPage = Math.min(itemsPage, itemPages);
  const visibleItems = displayedItems.slice(
    (currentItemsPage - 1) * itemsPerPage,
    currentItemsPage * itemsPerPage,
  );
  const submission = useRef<{ signature: string; key: string } | null>(null);
  const submitting = useRef(false);
  const customers = [
    ...new Map(
      [...createdCustomers, ...(options.data?.customers ?? [])].map(
        (customer) => [customer.id, customer],
      ),
    ).values(),
  ];
  const customer = customers.find((item) => item.id === customerId);
  const customerDue = decimalAmount(cents(customer?.due ?? "0.00"));
  const totalCents = completed
    ? cents(completed.total)
    : cart.reduce(
        (sum, line) => sum + cents(line.unitPrice) * BigInt(line.quantity),
        BigInt(0),
      );
  const total = decimalAmount(totalCents);
  const paid =
    completed?.paid ??
    (saleType === "cash"
      ? total
      : saleType === "partial"
        ? partialPaid || "0.00"
        : "0.00");
  const due = decimalAmount(totalCents - cents(paid));
  const busy = loading || options.loading;
  const loadError = options.error || listing.error || moduleError;
  const pages = Math.max(
    1,
    Math.ceil((listing.data?.total ?? 0) / (listing.data?.pageSize ?? 20)),
  );

  useEffect(() => {
    const element = cartBody.current;
    if (!element || current !== "new") return;
    const observer = new ResizeObserver(() => {
      const height = element.clientHeight;
      if (!height) return;
      const rowHeight = window.matchMedia("(max-height: 700px)").matches
        ? 38
        : 44;
      // Reserve the table header and horizontal scrollbar within the item area.
      setItemsPerPage(Math.max(1, Math.floor((height - 32 - 18) / rowHeight)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [current, mobilePanel, showHistory]);

  function resetEntry() {
    setEntries([blankSaleEntry("entry-0")]);
  }
  function addLine() {
    if (entries.length >= 100) return;
    const row = blankSaleEntry("entry-" + entrySequence.current++);
    row.typeId = entries.at(-1)?.typeId ?? "";
    setEntries((previous) => [...previous, row]);
    setItemsPage(Math.max(1, Math.ceil(cart.length / itemsPerPage)));
    setHistoryOpen(false);
    setCompleted(null);
    setError("");
    requestAnimationFrame(() => {
      const list = entryList.current;
      if (list) {
        list.scrollTop = 0;
        list.firstElementChild
          ?.querySelector("select")
          ?.focus({ preventScroll: true });
      }
    });
  }
  function updateEntry(id: string, patch: Partial<SaleEntry>) {
    setEntries((previous) =>
      previous.map((entry) =>
        entry.id === id ? { ...entry, ...patch, id } : entry,
      ),
    );
    setCompleted(null);
    setHistoryOpen(false);
    setError("");
  }
  function removeEntry(id: string) {
    setEntries((previous) => {
      const remaining = previous.filter((entry) => entry.id !== id);
      return remaining.length ? remaining : [blankSaleEntry("entry-0")];
    });
    setCompleted(null);
    setError("");
  }
  function removeProduct(productId: string) {
    setEntries((previous) => {
      const remaining = previous.filter(
        (entry) => entry.productId !== productId,
      );
      return remaining.length ? remaining : [blankSaleEntry("entry-0")];
    });
    setError("");
  }
  async function completeSale(event: FormEvent) {
    event.preventDefault();
    if (preview || submitting.current || completed) return;
    setError("");
    const items = cart;
    const selected = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (
        !entry.productId &&
        !entry.unitPrice &&
        (!entry.quantity || entry.quantity === "0")
      )
        continue;
      const product = options.data?.products.find(
        (product) =>
          product.id === entry.productId && product.type.id === entry.typeId,
      );
      const quantity = /^\d+$/.test(entry.quantity)
        ? Number(entry.quantity)
        : 0;
      if (
        !product ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 10000 ||
        !validPrice(entry.unitPrice)
      ) {
        setError(
          "Product " +
            (index + 1) +
            ": select a product and enter a valid quantity and unit price.",
        );
        return;
      }
      if (quantity > Number(product.availableQuantity)) {
        setError(
          "Product " + (index + 1) + ": quantity exceeds available stock.",
        );
        return;
      }
      if (selected.has(product.id)) {
        setError(
          "This product is already added. Update its existing row or remove the duplicate row.",
        );
        return;
      }
      selected.add(product.id);
    }
    if (!customer || !items.length) {
      setError("একজন customer এবং বিক্রয়ের জন্য অন্তত একটি পণ্য বাছাই করুন।");
      return;
    }
    if (!validPrice(paid) || cents(paid) > totalCents) {
      setError("পরিশোধের পরিমাণ মোট বিক্রয়মূল্যের মধ্যে হতে হবে।");
      return;
    }
    const account = options.data?.paymentAccounts.find(
      (item) => item.paymentMethod === "CASH",
    )?.id;
    if (cents(paid) > BigInt(0) && (!canPay || !account)) {
      setError("পেমেন্ট গ্রহণের জন্য সক্রিয় Cash account প্রয়োজন।");
      return;
    }
    const body = {
      customerId,
      saleDate,
      notes,
      items: items.map(({ productId, quantity, unitPrice }) => ({
        productId,
        quantity,
        unitPrice,
      })),
      paidAmount: decimalAmount(cents(paid)),
      ...(cents(paid) > BigInt(0) ? { paymentAccountId: account } : {}),
    };
    const signature = JSON.stringify(body);
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    submitting.current = true;
    setSaving(true);
    try {
      const result = await post<CompletedSale>("/sales/complete", body, {
        "Idempotency-Key": submission.current.key,
      });
      setCompleted({ ...result, items });
      setHistoryOpen(true);
      setPage(1);
      resetEntry();
      setPartialPaid("");
      setNotes("");
      submission.current = null;
      setRevision((value) => value + 1);
      notifyDashboardUpdate();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "বিক্রয় সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  if (!["new", "list"].includes(current))
    return (
      <div className="sales-workspace sales-secondary-workspace">
        <TransactionView purchase={false} preview={preview} view={current} />
      </div>
    );

  return (
    <div
      className={`sales-workspace ${current === "new" ? "sales-entry-workspace" : ""}`}
      aria-busy={busy || listing.loading}
    >
      <ModuleTabs
        moduleId="sales"
        current={current}
        preview={preview}
        items={[
          { id: "new", label: "New Sale", icon: ShoppingCart },
          { id: "list", label: "Sales List", icon: List },
          { id: "returns", label: "Sales Return", icon: RotateCcw },
          { id: "collections", label: "Due Collections", icon: ClipboardList },
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
            <span>বিক্রয় সফল হয়েছে</span>
          </div>
        ) : null}
      </div>
      {current === "list" ? (
        <Panel title="Sales List" className="sales-list-panel">
          <RecentSales
            data={listing.data}
            loading={loading || listing.loading}
            error={listing.error}
            page={page}
            pages={pages}
            onPage={setPage}
            bodyRef={cartBody}
            preview={preview}
            onDeleted={(id) => {
              if (completed?.id === id) setCompleted(null);
              setPage(1);
              setRevision((value) => value + 1);
            }}
          />
        </Panel>
      ) : (
        <form
          onSubmit={completeSale}
          className="sales-form"
          onInvalidCapture={(event) => {
            setMobilePanel(
              (event.target as HTMLElement).closest(".sales-side")
                ? "payment"
                : "details",
            );
          }}
        >
          <nav className="sales-mobile-panels" aria-label="Sale panels">
            {[
              ["details", "Details"],
              ["items", "Items / Sales"],
              ["payment", "Payment"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mobilePanel === id}
                onClick={() => setMobilePanel(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <fieldset
            disabled={saving || busy || Boolean(moduleError)}
            className="sales-fieldset"
          >
            <legend className="sr-only">Sales details</legend>
            <div className="sales-layout" data-panel={mobilePanel}>
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
                      <Field
                        label={
                          <>
                            <span className="sales-date-full-label">
                              Invoice Date
                            </span>
                            <span className="sales-date-short-label">Date</span>
                          </>
                        }
                        required
                      >
                        <div
                          className="sales-date-control"
                          title={`Invoice Date: ${saleDate}`}
                        >
                          <input
                            type="date"
                            aria-label="Sale date"
                            value={saleDate}
                            onChange={(event) =>
                              setSaleDate(event.target.value)
                            }
                            required
                          />
                          <CalendarDays
                            className="sales-date-icon"
                            aria-hidden="true"
                          />
                          <span className="sales-date-value" aria-hidden="true">
                            {saleDate
                              ? `${saleDate.slice(8, 10)}/${saleDate.slice(5, 7)}/${saleDate.slice(2, 4)}`
                              : ""}
                          </span>
                        </div>
                      </Field>
                    </div>
                    <p className="sales-customer-contact">
                      {customer
                        ? [customer.phone, customer.address]
                            .filter(Boolean)
                            .join(" · ")
                        : ""}
                    </p>
                  </div>
                </Panel>
                <Panel
                  title="Add Products"
                  className="sales-products-panel"
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLine}
                      disabled={entries.length >= 100}
                    >
                      <Plus /> Add Another Product
                    </Button>
                  }
                >
                  <div
                    className="erp-form-body sales-product-entries"
                    ref={entryList}
                  >
                    {[...entries].reverse().map((entry, index) => (
                      <SaleProductEntry
                        key={entry.id}
                        entry={entry}
                        index={entries.length - 1 - index}
                        options={options.data}
                        removable={entries.length > 1}
                        onChange={(patch) => updateEntry(entry.id, patch)}
                        onRemove={() => removeEntry(entry.id)}
                      />
                    ))}
                  </div>
                </Panel>
                <Panel
                  title={showHistory ? "Recent Sales" : "Sale Items"}
                  className="sales-cart-panel"
                  action={
                    <div className="flex items-center gap-2">
                      {displayedItems.length > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setHistoryOpen(!showHistory)}
                        >
                          {showHistory
                            ? `Sale Items (${displayedItems.length})`
                            : "Recent Sales"}
                        </Button>
                      ) : null}
                      {!showHistory ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!displayedItems.length}
                          onClick={() => {
                            setCompleted(null);
                            resetEntry();
                            setPartialPaid("");
                            setError("");
                          }}
                        >
                          <Trash2 />
                          Clear All
                        </Button>
                      ) : null}
                    </div>
                  }
                >
                  {showHistory ? (
                    <RecentSales
                      data={listing.data}
                      loading={loading || listing.loading}
                      error={listing.error}
                      page={page}
                      pages={pages}
                      onPage={setPage}
                      bodyRef={cartBody}
                      preview={preview}
                      onDeleted={(id) => {
                        if (completed?.id === id) setCompleted(null);
                        setPage(1);
                        setRevision((value) => value + 1);
                      }}
                    />
                  ) : (
                    <>
                      <div className="sales-cart-body" ref={cartBody}>
                        <div className="erp-table-wrap">
                          <table className="erp-table">
                            <caption className="sr-only">Sale items</caption>
                            <colgroup>
                              {[25, 20, 7, 13, 15, 12, 8].map(
                                (width, index) => (
                                  <col
                                    key={index}
                                    style={{ width: `${width}%` }}
                                  />
                                ),
                              )}
                            </colgroup>
                            <thead>
                              <tr>
                                {[
                                  "Product",
                                  "Model Number",
                                  "Qty",
                                  "Unit Price (৳)",
                                  "Total (৳)",
                                  "Due",
                                  "Action",
                                ].map((column) => (
                                  <th key={column}>{column}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleItems.map((line) => (
                                <tr key={line.entryId ?? line.productId}>
                                  <td>
                                    {line.name}
                                    <small className="block text-slate-500">
                                      {line.typeName}
                                    </small>
                                  </td>
                                  <td>{line.model || "-"}</td>
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
                                  <td aria-label="Customer outstanding due">
                                    {money(customerDue)}
                                  </td>
                                  <td>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Remove ${line.name}`}
                                      disabled={Boolean(completed)}
                                      onClick={() =>
                                        removeProduct(line.productId)
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
                        {!displayedItems.length ? (
                          <div className="erp-empty sales-cart-empty">
                            <PackageOpen />
                            <p>কোনো পণ্য যোগ করা হয়নি</p>
                            <span>
                              পণ্য, quantity ও unit price দিয়ে Confirm Sale চাপুন।
                            </span>
                          </div>
                        ) : null}
                      </div>
                      {displayedItems.length > 0 ? (
                        <div className="erp-pager sales-items-pager">
                          <span>
                            Page {currentItemsPage} / {itemPages} ·{" "}
                            {displayedItems.length} items
                          </span>
                          <div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Previous sale items page"
                              disabled={currentItemsPage <= 1}
                              onClick={() => setItemsPage(currentItemsPage - 1)}
                            >
                              <ChevronLeft />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Next sale items page"
                              disabled={currentItemsPage >= itemPages}
                              onClick={() => setItemsPage(currentItemsPage + 1)}
                            >
                              <ChevronRight />
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
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
                      ["Total Items", String(displayedItems.length)],
                      [
                        "Total Quantity",
                        String(
                          displayedItems.reduce(
                            (sum, line) => sum + line.quantity,
                            0,
                          ),
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
                        disabled={Boolean(completed)}
                        value={saleType}
                        onChange={(event) => {
                          setSaleType(event.target.value);
                          setPartialPaid("");
                        }}
                      >
                        <option value="cash" disabled={!canPay}>
                          Full Payment
                        </option>
                        <option value="partial" disabled={!canPay}>
                          Partial Payment
                        </option>
                        <option value="credit">Due</option>
                      </select>
                    </Field>
                    {saleType === "partial" ? (
                      <div className="sales-partial-payment-fields">
                        <Field label="Paid Amount (৳)" required>
                          <input
                            aria-label="Sales paid amount"
                            type="number"
                            min="0"
                            max={total}
                            step="0.01"
                            value={completed?.paid ?? partialPaid}
                            readOnly={Boolean(completed)}
                            placeholder="0.00"
                            required
                            onChange={(event) =>
                              setPartialPaid(event.target.value)
                            }
                          />
                        </Field>
                        <Field label="Due Amount (৳)">
                          <input
                            aria-label="Sales due amount"
                            readOnly
                            disabled
                            className="cursor-not-allowed bg-slate-50 text-slate-600"
                            value={due}
                          />
                        </Field>
                        <p className="sales-due-hint">
                          মোট টাকা থেকে পরিশোধ বাদ দিয়ে বাকি টাকা কাস্টমারের
                          বকেয়ায় যোগ হবে।
                        </p>
                      </div>
                    ) : saleType === "credit" ? (
                      <p className="sales-due-hint">
                        সম্পূর্ণ {money(total)} কাস্টমারের বকেয়ায় যোগ হবে।
                      </p>
                    ) : null}
                  </div>
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
            <div className="sales-confirm-actions">
              <Button
                type="button"
                variant="outline"
                disabled={saving || Boolean(completed)}
                onClick={() => {
                  setNotesDraft(notes);
                  setNotesOpen(true);
                }}
              >
                <FileText />
                {notes ? "Edit Note" : "Add Note"}
              </Button>
              <Button
                type="submit"
                disabled={
                  preview ||
                  saving ||
                  Boolean(completed) ||
                  busy ||
                  !customer ||
                  !cart.length ||
                  Boolean(moduleError)
                }
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
                {saving ? "Confirming..." : "Confirm Sale"}
              </Button>
            </div>
          </div>
        </form>
      )}
      <Dialog.Root open={notesOpen} onOpenChange={setNotesOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
          <Dialog.Content className="feature-dialog sales-notes-dialog">
            <Dialog.Title className="text-lg font-bold">Sale Note</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-slate-500">
              প্রয়োজন হলে বিক্রয় সংক্রান্ত নোট লিখুন।
            </Dialog.Description>
            <Field label="Sale notes">
              <textarea
                aria-label="Sale notes"
                rows={4}
                maxLength={2000}
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder="বিক্রয় সংক্রান্ত কোনো নোট..."
              />
            </Field>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {notesDraft.length}/2000
              </span>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  onClick={() => {
                    setNotes(notesDraft);
                    setNotesOpen(false);
                  }}
                >
                  Save Note
                </Button>
              </div>
            </div>
            <Dialog.Close
              aria-label="Close note dialog"
              className="absolute top-4 right-4"
            >
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={customerOpen} onOpenChange={setCustomerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
          <Dialog.Content
            className="feature-dialog sales-customer-dialog"
            onInteractOutside={(event) => event.preventDefault()}
          >
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
    </div>
  );
}
