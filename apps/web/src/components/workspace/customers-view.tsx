"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Eye,
  Filter,
  Plus,
  Search,
  Users,
} from "lucide-react";
import {
  ModuleTabs,
  Panel,
  workspaceHref,
} from "@/components/reference-ui";
import { Button } from "@/components/ui/button";
import { type CustomerList } from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { money } from "@/lib/utils";
import { CustomerForm } from "./customer-form";

const columns = [
  "#",
  "Customer",
  "Mobile",
  "Vehicle",
  "Total Sales",
  "Due",
  "Status",
  "Details",
];

export function CustomersView({
  preview,
  view = "",
}: {
  preview: boolean;
  view?: string;
}) {
  const router = useRouter();
  const current = ["new", "groups", "credit", "ledger"].includes(view)
    ? view
    : "list";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = new URLSearchParams({
    q: query,
    status,
    credit: current === "credit" ? "due" : "all",
    page: String(page),
    pageSize: "10",
  });
  const resource = useCatalogResource<CustomerList>(
    preview ? null : "/customers?" + params,
    revision,
  );
  const list = resource.data;
  const selected =
    list?.items.find((customer) => customer.id === selectedId) ??
    list?.items[0];
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / 10));
  const groups = new Map<
    string,
    { customers: Set<string>; vehicles: number }
  >();
  for (const customer of list?.items ?? []) {
    for (const vehicle of customer.vehicles) {
      const group = groups.get(vehicle.type) ?? {
        customers: new Set<string>(),
        vehicles: 0,
      };
      group.customers.add(customer.id);
      group.vehicles += 1;
      groups.set(vehicle.type, group);
    }
  }
  const title =
    current === "credit"
      ? "Credit Customers"
      : current === "ledger"
        ? "Customer Ledger"
        : "Customer List";
  return (
    <>
      <ModuleTabs
        moduleId="customers"
        current={current}
        preview={preview}
        items={[
          { id: "list", label: "Customer List", icon: Users },
          { id: "new", label: "Add Customer", icon: Plus },
          { id: "groups", label: "Customer Groups", icon: Car },
          { id: "credit", label: "Credit Customers", icon: CreditCard },
          { id: "ledger", label: "Customer Ledger", icon: ClipboardList },
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
      {current === "new" ? (
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
          <Panel className="mb-4">
            <form
              className="erp-filterbar"
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
                  placeholder="Search name, mobile or vehicle..."
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
              <Button type="submit" variant="outline" className="erp-button">
                <Filter />
                Filter
              </Button>
              <Button asChild className="erp-button">
                <Link href={workspaceHref("customers", "new", preview)}>
                  <Plus />
                  New Customer
                </Link>
              </Button>
            </form>
          </Panel>
          {current === "groups" ? (
            <Panel
              title="Vehicle Types on This Page"
              icon={Car}
              className="mb-4"
            >
              <div className="erp-table-wrap">
                <table className="erp-table">
                  <caption className="sr-only">
                    Customer vehicle groups on the current page
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Vehicle Type</th>
                      <th scope="col">Customers</th>
                      <th scope="col">Vehicles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...groups]
                      .sort(([first], [second]) => first.localeCompare(second))
                      .map(([type, group]) => (
                        <tr key={type}>
                          <td>{type}</td>
                          <td>{group.customers.size}</td>
                          <td>{group.vehicles}</td>
                        </tr>
                      ))}
                    {!groups.size ? (
                      <tr>
                        <td colSpan={3} className="text-slate-500">
                          {resource.loading
                            ? "Loading vehicle groups..."
                            : "No vehicle details in these customer records."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
          <div className="master-detail-layout">
            <Panel title={title} icon={Users}>
              {current === "ledger" ? (
                <p className="px-4 pb-3 text-xs text-slate-500">
                  Select a customer to view their sales total and outstanding
                  balance.
                </p>
              ) : null}
              <div className="erp-table-wrap" aria-busy={resource.loading}>
                <table className="erp-table min-w-[820px]">
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
                        <td>{(page - 1) * 10 + index + 1}</td>
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
                        <td>
                          {customer.vehicles.length
                            ? customer.vehicles
                                .map(
                                  (vehicle) =>
                                    vehicle.type +
                                    (vehicle.identifier
                                      ? ` · ${vehicle.identifier}`
                                      : ""),
                                )
                                .join(", ")
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap">
                          {money(customer.totalSales)}
                        </td>
                        <td className="whitespace-nowrap">
                          {money(customer.due)}
                        </td>
                        <td>{customer.active ? "Active" : "Inactive"}</td>
                        <td>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`View ${customer.name}`}
                            onClick={() => setSelectedId(customer.id)}
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
            <Panel title="Customer Details" className="erp-details">
              {selected ? (
                <>
                  <dl>
                    {[
                      ["Name", selected.name],
                      ["Mobile", selected.phone],
                      ["Address", selected.address || "—"],
                      ["Status", selected.active ? "Active" : "Inactive"],
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
                  <div className="px-4 pb-4">
                    <h3 className="mb-2 text-xs font-semibold text-slate-700">
                      Vehicles
                    </h3>
                    {selected.vehicles.length ? (
                      <ul className="mb-4 grid gap-2 text-xs text-slate-600">
                        {selected.vehicles.map((vehicle) => (
                          <li
                            key={vehicle.id}
                            className="[overflow-wrap:anywhere]"
                          >
                            {vehicle.type}
                            {vehicle.identifier
                              ? ` · ${vehicle.identifier}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mb-4 text-xs text-slate-500">
                        No vehicle details added.
                      </p>
                    )}
                    {selected.active ? (
                      <Button asChild size="sm">
                        <Link
                          href={
                            preview
                              ? workspaceHref("sales", "new", true)
                              : `/sales/new?customer=${encodeURIComponent(selected.id)}`
                          }
                        >
                          <Plus />
                          New Sale
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="erp-details-hint">
                  Select a customer to view their contact and vehicle details.
                </p>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
