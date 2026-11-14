"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Eye,
  Filter,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import {
  EmptyTable,
  Field,
  ModuleTabs,
  Panel,
  StatCard,
  workspaceHref,
} from "@/components/reference-ui";
import { Button } from "@/components/ui/button";
import {
  api,
  post,
  type DashboardData,
  type SupplierList,
  type SupplierRecord,
} from "@/lib/api";
import { money } from "@/lib/utils";

const supplierSchema = z.object({
  name: z.string().trim().min(1, "সাপ্লায়ারের নাম লিখুন।").max(160),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9][0-9 ()-]{5,29}$/, "সঠিক মোবাইল নম্বর লিখুন।"),
  company: z.string().trim().max(160),
  address: z.string().trim().max(500),
});
const columns = [
  "#",
  "নাম",
  "কোম্পানি / ব্র্যান্ড",
  "মোবাইল",
  "ঠিকানা",
  "স্ট্যাটাস",
  "অ্যাকশন",
];

function SupplierForm({ preview }: { preview: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || saving) return;
    setError("");
    setFields({});
    const form = new FormData(event.currentTarget);
    const result = supplierSchema.safeParse({
      name: form.get("name"),
      phone: form.get("phone"),
      company: form.get("company"),
      address: form.get("address"),
    });
    if (!result.success) {
      setFields(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }
    setSaving(true);
    try {
      await post<SupplierRecord>("/suppliers", result.data);
      router.replace("/suppliers");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "সাপ্লায়ার সেভ করা যায়নি। আবার চেষ্টা করুন।",
      );
      setSaving(false);
    }
  }
  return (
    <Panel title="নতুন সাপ্লায়ার" icon={Truck}>
      <form onSubmit={save} className="erp-form-body">
        <fieldset disabled={saving}>
          <legend className="sr-only">Supplier contact information</legend>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Field label="নাম" required>
                <input
                  name="name"
                  aria-label="Supplier name"
                  autoComplete="name"
                  placeholder="সাপ্লায়ারের নাম"
                  required
                  maxLength={160}
                  aria-invalid={Boolean(fields.name)}
                  aria-describedby={
                    fields.name ? "supplier-name-error" : undefined
                  }
                />
              </Field>
              {fields.name ? (
                <p
                  id="supplier-name-error"
                  className="mt-1 text-xs text-red-600"
                >
                  {fields.name}
                </p>
              ) : null}
            </div>
            <div>
              <Field label="মোবাইল নম্বর" required>
                <input
                  name="phone"
                  aria-label="Supplier mobile number"
                  type="tel"
                  autoComplete="tel"
                  placeholder="01XXXXXXXXX"
                  required
                  maxLength={30}
                  aria-invalid={Boolean(fields.phone)}
                  aria-describedby={
                    fields.phone ? "supplier-phone-error" : undefined
                  }
                />
              </Field>
              {fields.phone ? (
                <p
                  id="supplier-phone-error"
                  className="mt-1 text-xs text-red-600"
                >
                  {fields.phone}
                </p>
              ) : null}
            </div>
            <div>
              <Field label="Company / Brand (optional)">
                <input
                  name="company"
                  aria-label="Supplier company or brand"
                  autoComplete="organization"
                  placeholder="কোম্পানির নাম"
                  maxLength={160}
                  aria-invalid={Boolean(fields.company)}
                  aria-describedby={
                    fields.company ? "supplier-company-error" : undefined
                  }
                />
              </Field>
              {fields.company ? (
                <p
                  id="supplier-company-error"
                  className="mt-1 text-xs text-red-600"
                >
                  {fields.company}
                </p>
              ) : null}
            </div>
            <div className="md:col-span-3">
              <Field label="ঠিকানা (ঐচ্ছিক)">
                <textarea
                  name="address"
                  aria-label="Supplier address (optional)"
                  autoComplete="street-address"
                  placeholder="ঠিকানা থাকলে লিখুন..."
                  maxLength={500}
                  aria-invalid={Boolean(fields.address)}
                  aria-describedby={
                    fields.address ? "supplier-address-error" : undefined
                  }
                />
              </Field>
              {fields.address ? (
                <p
                  id="supplier-address-error"
                  className="mt-1 text-xs text-red-600"
                >
                  {fields.address}
                </p>
              ) : null}
            </div>
          </div>
        </fieldset>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}
        {preview ? (
          <p className="mt-4 text-xs text-amber-700">
            UI preview: সাপ্লায়ার সেভ করতে লগইন করুন।
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-3">
          <Button asChild variant="outline">
            <Link href={workspaceHref("suppliers", "", preview)}>Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={saving || preview}
            className="erp-button"
          >
            {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
            {saving ? "Saving..." : "Save Supplier"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function SupplierView({
  preview,
  view = "",
  data,
}: {
  preview: boolean;
  view?: string;
  data: DashboardData | null;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<{
    key: string;
    data: SupplierList;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const key = JSON.stringify([query, status, page, revision]);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: query,
      status,
      page: String(page),
      pageSize: "10",
    });
    api<SupplierList>("/suppliers?" + params, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : "সাপ্লায়ারের তালিকা পাওয়া যায়নি।",
          });
      });
    return () => controller.abort();
  }, [preview, query, status, page, key]);
  const list = result?.key === key ? result.data : null;
  const error = failure?.key === key ? failure.message : "";
  const loading = !preview && !list && !error;
  const selected = list?.items.find((supplier) => supplier.id === selectedId);
  const current = view === "new" ? "new" : "list";
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / 10));
  return (
    <>
      <ModuleTabs
        moduleId="suppliers"
        current={current}
        preview={preview}
        items={[
          { id: "list", label: "Supplier List", icon: Truck },
          { id: "new", label: "Add Supplier", icon: Plus },
          { id: "groups", label: "Company / Brands", icon: Boxes },
          { id: "credit", label: "Supplier Dues", icon: CreditCard },
          { id: "ledger", label: "Supplier Ledger", icon: ClipboardList },
        ]}
      />
      <div className="erp-stats">
        <StatCard
          label="Total Suppliers"
          value={list ? String(list.summary.total) : "—"}
          icon={Truck}
        />
        <StatCard
          label="Active Suppliers"
          value={list ? String(list.summary.active) : "—"}
          icon={UserRoundCheck}
          tone="blue"
        />
        <StatCard
          label="Inactive Suppliers"
          value={list ? String(list.summary.total - list.summary.active) : "—"}
          icon={CreditCard}
          tone="orange"
        />
        <StatCard
          label="Total Payable"
          value={money(preview ? null : data?.financials?.supplierDues)}
          caption="সকল সময়ের বকেয়া"
          icon={ShieldCheck}
          tone="purple"
        />
        <StatCard
          label="Purchases (Selected Period)"
          value={money(preview ? null : data?.financials?.todayPurchases)}
          icon={ShoppingCart}
        />
      </div>
      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          <span>{error}</span>
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
        <SupplierForm preview={preview} />
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
                  aria-label="Search suppliers"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  maxLength={160}
                  placeholder="সাপ্লায়ারের নাম, মোবাইল বা কোম্পানি দিয়ে খুঁজুন..."
                />
              </label>
              <select
                className="erp-select"
                aria-label="Supplier status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">স্ট্যাটাস: সকল</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <Button type="submit" variant="outline" className="erp-button">
                <Filter />
                Filter
              </Button>
              <Button asChild className="erp-button">
                <Link href={workspaceHref("suppliers", "new", preview)}>
                  <Plus />
                  নতুন সাপ্লায়ার
                </Link>
              </Button>
            </form>
          </Panel>
          <div className="master-detail-layout">
            <Panel>
              {loading ? (
                <p
                  role="status"
                  className="p-8 text-center text-sm text-slate-500"
                >
                  Loading suppliers...
                </p>
              ) : list?.items.length ? (
                <div className="erp-table-wrap">
                  <table className="erp-table">
                    <caption className="sr-only">Suppliers</caption>
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
                      {list.items.map((supplier, index) => (
                        <tr
                          key={supplier.id}
                          className={
                            selectedId === supplier.id
                              ? "bg-green-50"
                              : undefined
                          }
                        >
                          <td>{(page - 1) * 10 + index + 1}</td>
                          <td>
                            <button
                              type="button"
                              className="text-left font-semibold text-green-800 hover:underline"
                              onClick={() => setSelectedId(supplier.id)}
                            >
                              {supplier.name}
                            </button>
                          </td>
                          <td>{supplier.company || "—"}</td>
                          <td>{supplier.phone || "—"}</td>
                          <td className="max-w-64 break-words whitespace-normal">
                            {supplier.address || "—"}
                          </td>
                          <td>{supplier.active ? "Active" : "Inactive"}</td>
                          <td>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`View ${supplier.name}`}
                              onClick={() => setSelectedId(supplier.id)}
                            >
                              <Eye />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyTable
                  columns={columns}
                  description={
                    query
                      ? "খোঁজার সঙ্গে মেলে এমন সাপ্লায়ার নেই।"
                      : "নতুন সাপ্লায়ার যোগ করলে এখানে দেখা যাবে।"
                  }
                />
              )}
              <div className="erp-pager">
                <span>
                  {list?.total ?? 0} suppliers · Page {page} of {pages}
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous supplier page"
                    disabled={loading || page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next supplier page"
                    disabled={loading || page >= pages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </Panel>
            <Panel title="সাপ্লায়ারের বিস্তারিত" className="erp-details">
              {selected ? (
                <dl>
                  {[
                    ["নাম", selected.name],
                    ["কোম্পানি / ব্র্যান্ড", selected.company],
                    ["মোবাইল", selected.phone],
                    ["ঠিকানা", selected.address],
                    ["স্ট্যাটাস", selected.active ? "Active" : "Inactive"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className="break-words">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="erp-details-hint">
                  বিস্তারিত দেখতে তালিকা থেকে একটি সাপ্লায়ার বাছাই করুন।
                </p>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
