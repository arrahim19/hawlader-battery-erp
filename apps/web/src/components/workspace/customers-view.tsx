"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { ModuleTabs, Panel, workspaceHref } from "@/components/reference-ui";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { type CustomerList, type CustomerRecord } from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { money } from "@/lib/utils";
import { CustomerForm } from "./customer-form";
import { CustomerSalesHistoryDialog } from "./customer-sales-history";
import { CustomerLedgerView } from "./customer-ledger-view";

const columns = ["#", "Customer", "Mobile", "Total Sales", "Due", "Details"];
const mobileCustomersQuery = "(max-width: 1023px)";
function subscribeCustomerPageSize(listener: () => void) {
  const query = window.matchMedia(mobileCustomersQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const customerPageSize = () =>
  window.matchMedia(mobileCustomersQuery).matches ? 3 : 15;
const staticCustomerPageSize = () => 15;

export function CustomersView({
  preview,
  view = "",
}: {
  preview: boolean;
  view?: string;
}) {
  const router = useRouter();
  const user = useSession();
  const canSell =
    preview || Boolean(user?.permissions.includes("sales.manage"));
  const current = ["new", "credit", "ledger"].includes(view) ? view : "list";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const pageSize = useSyncExternalStore(
    subscribeCustomerPageSize,
    customerPageSize,
    staticCustomerPageSize,
  );
  const [pagination, setPagination] = useState({ page: 1, pageSize });
  const page = pagination.pageSize === pageSize ? pagination.page : 1;
  const setPage = useCallback(
    (next: number | ((previous: number) => number)) => {
      setPagination((previous) => {
        const currentPage = previous.pageSize === pageSize ? previous.page : 1;
        return {
          page: typeof next === "function" ? next(currentPage) : next,
          pageSize,
        };
      });
    },
    [pageSize],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, setPage]);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<CustomerRecord | null>(
    null,
  );
  const historyButton = useRef<HTMLButtonElement | null>(null);
  const params = new URLSearchParams({
    q: query,
    status,
    credit: current === "credit" ? "due" : "all",
    page: String(page),
    pageSize: String(pageSize),
  });
  const resource = useCatalogResource<CustomerList>(
    preview || current === "ledger" ? null : "/customers?" + params,
    revision,
  );
  const list = resource.data;
  const selected =
    list?.items.find((customer) => customer.id === selectedId) ??
    list?.items[0];
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / pageSize));
  const title = current === "credit" ? "Credit Customers" : "Customer List";
  const filters = (
    <form
      className="customer-list-filters"
      role="search"
      aria-label="Customer filters"
      onSubmit={(event) => {
        event.preventDefault();
        setQuery(search.trim());
        setPage(1);
      }}
    >
      <label className="erp-search">
        <Search size={19} />
        <input
          aria-label="Search customers"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or mobile"
          maxLength={160}
        />
      </label>
      <select
        className="erp-select"
        aria-label="Customer status"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setPage(1);
        }}
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </form>
  );
  return (
    <>
      <ModuleTabs
        moduleId="customers"
        current={current}
        preview={preview}
        items={[
          { id: "list", label: "Customer List", icon: Users },
          { id: "new", label: "Add Customer", icon: Plus },
          { id: "ledger", label: "Ledger", icon: ClipboardList },
        ]}
      />
      {resource.error ? (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          <span>{resource.error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {current === "ledger" ? (
        <CustomerLedgerView preview={preview} />
      ) : current === "new" ? (
        <Panel title="Add Customer" icon={Users}>
          <div className="erp-form-body">
            <CustomerForm
              preview={preview}
              onSaved={() => router.replace("/customers")}
              onCancel={() =>
                router.push(workspaceHref("customers", "", preview))
              }
            />
          </div>
        </Panel>
      ) : (
        <>
          <div className="master-detail-layout customer-master-detail">
            <Panel
              title={title}
              icon={Users}
              className="customer-list-panel"
              action={filters}
            >
              <div className="erp-table-wrap" aria-busy={resource.loading}>
                <table className="erp-table min-w-[680px]">
                  <caption className="sr-only">Customers</caption>
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list?.items.map((customer, index) => (
                      <tr
                        key={customer.id}
                        className={
                          selected?.id === customer.id
                            ? "bg-green-50"
                            : undefined
                        }
                      >
                        <td>{(page - 1) * pageSize + index + 1}</td>
                        <td>
                          <button
                            type="button"
                            className="text-left font-semibold text-green-800 hover:underline"
                            aria-pressed={selected?.id === customer.id}
                            onClick={() => setSelectedId(customer.id)}
                          >
                            {customer.name}
                          </button>
                        </td>
                        <td className="whitespace-nowrap">{customer.phone}</td>

                        <td className="whitespace-nowrap">
                          {money(customer.totalSales)}
                        </td>
                        <td className="whitespace-nowrap">
                          {money(customer.due)}
                        </td>
                        <td>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Details"
                            title={`Details — ${customer.name}`}
                            onClick={(event) => {
                              historyButton.current = event.currentTarget;
                              setSelectedId(customer.id);
                              setHistoryCustomer(customer);
                            }}
                          >
                            <Eye />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!list?.items.length ? (
                      <tr>
                        <td colSpan={columns.length}>
                          <div
                            role="status"
                            className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-slate-500"
                          >
                            {resource.loading
                              ? "Loading customers..."
                              : resource.error
                                ? "Unable to load customers."
                                : preview
                                  ? "Sign in to view customer records."
                                  : current === "credit"
                                    ? "No customers have an outstanding balance."
                                    : query
                                      ? "No matching customers."
                                      : "No customers yet. Add a customer here or from New Sale."}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="erp-pager">
                <span>
                  {list ? `${list.total} customers` : "—"} · Page {page} of{" "}
                  {pages}
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous customer page"
                    disabled={resource.loading || page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next customer page"
                    disabled={resource.loading || page >= pages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </Panel>
            <Panel
              title="Customer Details"
              className="erp-details customer-details-panel"
              action={
                <Button
                  type="button"
                  size="sm"
                  className="customer-new-sale"
                  disabled={!selected?.active || !canSell}
                  onClick={() => {
                    if (!selected?.active || !canSell) return;
                    router.push(
                      preview
                        ? workspaceHref("sales", "new", true)
                        : `/sales/new?customer=${encodeURIComponent(selected.id)}`,
                    );
                  }}
                >
                  <Plus />
                  New Sale
                </Button>
              }
            >
              {selected ? (
                <>
                  <dl>
                    {[
                      ["Name", selected.name],
                      ["Mobile", selected.phone],
                      ["Address", selected.address || "—"],
                      ["Total Sales", money(selected.totalSales)],
                      ["Outstanding Due", money(selected.due)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd className="min-w-0 [overflow-wrap:anywhere]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="erp-details-hint">
                  Select a customer to view their contact details.
                </p>
              )}
            </Panel>
          </div>
        </>
      )}
      {historyCustomer ? (
        <CustomerSalesHistoryDialog
          key={historyCustomer.id}
          customer={historyCustomer}
          preview={preview}
          onClose={() => setHistoryCustomer(null)}
          returnFocus={() => historyButton.current?.focus()}
        />
      ) : null}
    </>
  );
}
