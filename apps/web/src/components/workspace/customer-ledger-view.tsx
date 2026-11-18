"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Eye,
  MapPin,
  Phone,
  Plus,
  Printer,
  Search,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/reference-ui";
import { useSession } from "@/components/session-provider";
import { post, type CustomerLedger, type CustomerList } from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { useBusinessDate } from "@/lib/use-business-date";
import { notifyDashboardUpdate } from "@/lib/use-dashboard";
import { businessDate, money } from "@/lib/utils";
import { cents } from "@/lib/purchase-amounts";
import { CustomerSalesHistoryDialog } from "./customer-sales-history";

function CollectPaymentDialog({
  ledger,
  onClose,
  onSaved,
}: {
  ledger: CustomerLedger;
  onClose: () => void;
  onSaved: (receipt: string) => void;
}) {
  const today = useBusinessDate();
  const [dateValue, setDate] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState(ledger.paymentAccounts[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const submission = useRef<{ body: string; key: string } | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const body = {
      date: dateValue ?? today,
      amount,
      paymentAccountId: account,
      reference: reference.trim(),
    };
    const serialized = JSON.stringify(body);
    if (submission.current?.body !== serialized)
      submission.current = { body: serialized, key: crypto.randomUUID() };
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await post<{ number: string }>(
        `/customers/${ledger.customer.id}/payments`,
        body,
        { "Idempotency-Key": submission.current.key },
      );
      notifyDashboardUpdate();
      onSaved(result.number);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save payment.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="customer-history-overlay" />
        <Dialog.Content className="feature-dialog ledger-payment-dialog">
          <header>
            <span className="ledger-payment-mark">
              <Wallet size={22} />
            </span>
            <div>
              <Dialog.Title>Collect Due</Dialog.Title>
              <Dialog.Description>{ledger.customer.name}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={saving}
                aria-label="Close payment"
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
          </header>
          <form onSubmit={save}>
            <div className="ledger-payment-due">
              <span>Current outstanding due</span>
              <strong>{money(ledger.customer.due)}</strong>
            </div>
            <fieldset disabled={saving} className="ledger-payment-fields">
              <Field label="Amount (৳)" required>
                <input
                  autoFocus
                  aria-label="Collection amount"
                  type="number"
                  min="0.01"
                  max={ledger.customer.due}
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </Field>
              <Field label="Payment date" required>
                <input
                  aria-label="Collection date"
                  type="date"
                  value={dateValue ?? today}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </Field>
              <Field label="Payment account" required>
                <select
                  aria-label="Collection account"
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  required
                >
                  {ledger.paymentAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reference / note">
                <input
                  aria-label="Collection reference"
                  value={reference}
                  maxLength={160}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Receipt or transaction reference"
                />
              </Field>
            </fieldset>
            <p className="ledger-payment-hint">
              Payment will be applied to the oldest outstanding invoices.
            </p>
            {error ? (
              <p role="alert" className="ledger-error">
                {error}
              </p>
            ) : null}
            <footer>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !account}>
                {saving ? "Saving…" : "Save Payment"}
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CustomerLedgerView({ preview }: { preview: boolean }) {
  const user = useSession();
  const today = useBusinessDate();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [filterError, setFilterError] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [receipt, setReceipt] = useState("");
  const historyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setCustomerPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const customers = useCatalogResource<CustomerList>(
    preview
      ? null
      : `/customers?${new URLSearchParams({ q: query, status: "all", credit: "all", page: String(customerPage), pageSize: "10" })}`,
    revision,
    true,
  );
  const selected =
    customers.data?.items.find((item) => item.id === selectedId) ??
    customers.data?.items[0];
  const resource = useCatalogResource<CustomerLedger>(
    !preview && selected
      ? `/customers/${selected.id}/ledger?${new URLSearchParams(period.from && period.to ? period : {})}`
      : null,
    revision,
    true,
  );
  const ledger = resource.data;
  const customer = ledger?.customer ?? selected;
  const pageSize = 15;
  const pages = Math.max(1, Math.ceil((ledger?.items.length ?? 0) / pageSize));
  const currentPage = Math.min(page, pages);
  const canCollect = Boolean(
    user?.permissions.some((p) =>
      ["finance.write", "payments.customer"].includes(p),
    ),
  );
  const customerPages = Math.max(
    1,
    Math.ceil((customers.data?.total ?? 0) / 10),
  );
  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Boolean(from) !== Boolean(to) || (from && from > to)) {
      setFilterError("Choose a valid start and end date.");
      return;
    }
    setFilterError("");
    setPeriod({ from, to });
    setPage(1);
  }
  // Omit empty dates so the API can distinguish all-time from a filtered statement.
  const hasPeriod = Boolean(period.from && period.to);
  return (
    <section className="customer-ledger" aria-label="Customer ledger">
      <div className="ledger-print-brand">
        Howlader Battery<span>Customer statement</span>
      </div>
      <div className="ledger-page-heading">
        <Button
          className="ledger-print-button"
          variant="outline"
          size="sm"
          disabled={!ledger || Boolean(resource.error)}
          onClick={() => window.print()}
        >
          <Printer size={16} /> Print / PDF
        </Button>
      </div>
      <div className="ledger-layout">
        <aside className="ledger-customers erp-panel">
          <div className="ledger-customer-search">
            <Search size={17} />
            <input
              aria-label="Search ledger customers"
              placeholder="Customer name or mobile"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={160}
            />
          </div>
          <div className="ledger-customer-list" aria-busy={customers.loading}>
            {customers.data?.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={selected?.id === item.id ? "selected" : ""}
                aria-pressed={selected?.id === item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setPage(1);
                  setReceipt("");
                }}
              >
                <span className="ledger-avatar">{item.name.slice(0, 1)}</span>
                <span className="ledger-customer-name">
                  <strong>{item.name}</strong>
                  <small>{item.phone}</small>
                </span>
                <span
                  className={
                    cents(item.due) > BigInt(0)
                      ? "ledger-customer-due has-due"
                      : "ledger-customer-due"
                  }
                >
                  {money(item.due)}
                  <small>Due</small>
                </span>
              </button>
            ))}
            {!customers.data?.items.length ? (
              <p className="ledger-empty">
                {customers.loading
                  ? "Loading customers…"
                  : preview
                    ? "Sign in to view customers."
                    : "No matching customers."}
              </p>
            ) : null}
          </div>
          <div className="ledger-customer-pager">
            <span>{customers.data?.total ?? 0} customers</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous ledger customers"
              disabled={customerPage <= 1 || customers.loading}
              onClick={() => setCustomerPage((p) => p - 1)}
            >
              <ChevronLeft size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next ledger customers"
              disabled={customerPage >= customerPages || customers.loading}
              onClick={() => setCustomerPage((p) => p + 1)}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
        </aside>
        <div className="ledger-statement">
          <div className="ledger-customer-card erp-panel">
            <span className="ledger-profile-icon">
              <Users size={23} />
            </span>
            <div className="ledger-contact">
              <h3>{customer?.name ?? "Select a customer"}</h3>
              <div>
                {customer?.phone ? (
                  <span>
                    <Phone size={13} />
                    {customer.phone}
                  </span>
                ) : null}
                {customer?.address ? (
                  <span>
                    <MapPin size={13} />
                    {customer.address}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="ledger-current-due">
              <span>Current due</span>
              <strong>{money(customer?.due)}</strong>
            </div>
            <Button
              size="sm"
              disabled={
                !ledger ||
                !customer?.active ||
                !canCollect ||
                !ledger.paymentAccounts.length ||
                cents(customer?.due ?? "0") <= BigInt(0) ||
                Boolean(resource.error)
              }
              onClick={() => setCollecting(true)}
            >
              <Plus size={16} /> Collect Due
            </Button>
          </div>
          <form className="ledger-period" onSubmit={applyPeriod}>
            <Field label="From">
              <input
                aria-label="Ledger from date"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field label="To">
              <input
                aria-label="Ledger to date"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!today}
              onClick={() => {
                const start = today.slice(0, 7) + "-01";
                setFrom(start);
                setTo(today);
                setPeriod({ from: start, to: today });
                setPage(1);
                setFilterError("");
              }}
            >
              This Month
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
                setPeriod({ from: "", to: "" });
                setPage(1);
                setFilterError("");
              }}
            >
              All Time
            </Button>
          </form>
          {filterError || resource.error || customers.error ? (
            <div role="alert" className="ledger-error">
              <span>{filterError || resource.error || customers.error}</span>
              {resource.error || customers.error ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
          {receipt ? (
            <div role="status" className="ledger-success">
              <span>Payment received · {receipt}</span>
              <button
                type="button"
                aria-label="Dismiss payment confirmation"
                onClick={() => setReceipt("")}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          <div className="ledger-summary">
            {[
              {
                label: "মোট বিক্রি",
                value: ledger?.summary.debit,
                icon: ArrowUpRight,
                tone: "debit",
              },
              {
                label: "মোট জমা",
                value: ledger?.summary.credit,
                icon: ArrowDownLeft,
                tone: "credit",
              },
              {
                label: "শেষ বাকি",
                value: ledger?.summary.closing,
                icon: CreditCard,
                tone: "closing",
              },
            ].map((item) => (
              <div key={item.label} className={"ledger-stat " + item.tone}>
                <span className="ledger-stat-icon">
                  <item.icon size={18} />
                </span>
                <div>
                  <span>{item.label}</span>
                  <strong>{money(item.value)}</strong>
                </div>
              </div>
            ))}
          </div>
          <div
            className="ledger-transactions erp-panel"
            aria-busy={resource.loading}
          >
            <header>
              <div>
                <h3>
                  <ClipboardList size={18} /> লেনদেনের হিসাব
                </h3>
                <p>
                  {hasPeriod
                    ? `${businessDate(period.from)} – ${businessDate(period.to)}`
                    : "সব সময়ের হিসাব"}
                </p>
              </div>
              <Button
                ref={historyButton}
                size="sm"
                variant="outline"
                disabled={!customer}
                onClick={() => setHistoryOpen(true)}
              >
                <Eye size={15} /> Invoice Details
              </Button>
            </header>
            <div className="ledger-table-scroll">
              <table className="erp-table ledger-table">
                <caption className="sr-only">
                  Customer ledger transactions
                </caption>
                <thead>
                  <tr>
                    {[
                      "তারিখ",
                      "ইনভয়েস / বিবরণ",
                      "বিক্রি (৳)",
                      "জমা (৳)",
                      "বাকি (৳)",
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger && ledger.summary.opening !== "0.00" ? (
                    <tr className="ledger-opening-row">
                      <td colSpan={2}>
                        আগের বাকি
                        {hasPeriod ? " · " + businessDate(period.from) : ""}
                      </td>
                      <td>—</td>
                      <td>—</td>
                      <td>{money(ledger?.summary.opening)}</td>
                    </tr>
                  ) : null}
                  {ledger?.items.map((item, index) => (
                    <tr
                      key={item.id}
                      className={
                        index < (currentPage - 1) * pageSize ||
                        index >= currentPage * pageSize
                          ? "ledger-print-row"
                          : undefined
                      }
                    >
                      <td className="ledger-date">{businessDate(item.date)}</td>
                      <td className="ledger-reference" title={item.reference}>
                        {item.reference}
                        {item.description ? (
                          <span className="ledger-description">
                            {item.description}
                          </span>
                        ) : null}
                      </td>
                      <td>{item.debit !== "0.00" ? money(item.debit) : "—"}</td>
                      <td className="ledger-credit">
                        {cents(item.credit) ? money(item.credit) : "—"}
                      </td>
                      <td>{money(item.balance)}</td>
                    </tr>
                  ))}
                  {!ledger?.items.length ? (
                    <tr>
                      <td colSpan={5}>
                        <div role="status" className="ledger-empty">
                          <ClipboardList size={30} />
                          <strong>
                            {resource.loading
                              ? "Loading statement…"
                              : !customer
                                ? "Select a customer"
                                : "No transactions in this period"}
                          </strong>
                          <span>
                            {!customer
                              ? "Choose a customer to view their account statement."
                              : "Adjust the date range to see more transactions."}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>
                      মোট
                    </th>
                    <td>{money(ledger?.summary.debit)}</td>
                    <td>{money(ledger?.summary.credit)}</td>
                    <td>{money(ledger?.summary.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <footer>
              <span>
                {ledger?.items.length ?? 0}টি লেনদেন · পৃষ্ঠা {currentPage} /{" "}
                {pages}
              </span>
              <div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous ledger page"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next ledger page"
                  disabled={currentPage >= pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </footer>
          </div>
        </div>
      </div>
      {collecting && ledger ? (
        <CollectPaymentDialog
          ledger={ledger}
          onClose={() => setCollecting(false)}
          onSaved={(number) => {
            setCollecting(false);
            setReceipt(number);
            setRevision((value) => value + 1);
          }}
        />
      ) : null}
      {historyOpen && customer ? (
        <CustomerSalesHistoryDialog
          customer={customer}
          preview={preview}
          onClose={() => setHistoryOpen(false)}
          returnFocus={() => historyButton.current?.focus()}
        />
      ) : null}
    </section>
  );
}
