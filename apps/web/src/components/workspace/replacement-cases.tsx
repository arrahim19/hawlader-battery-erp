"use client";
import Link from "next/link";
import { useState } from "react";
import {
  CheckCheck,
  Clock3,
  Eye,
  PackageCheck,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import {
  EmptyTable,
  Pager,
  Panel,
  StatCard,
  workspaceHref,
} from "@/components/reference-ui";
import {
  post,
  type ReplacementCase,
  type ReplacementList,
  type ReplacementStage,
} from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { notifyDashboardUpdate } from "@/lib/use-dashboard";
import { businessDate } from "@/lib/utils";

const stages = [
  {
    value: "FAULTY",
    label: "Faulty",
    icon: Clock3,
    tone: "orange",
    permission: "replacements.resolve",
  },
  {
    value: "SENT",
    label: "Sent",
    icon: Truck,
    tone: "purple",
    permission: "replacements.dispatch",
  },
  {
    value: "RECEIVED",
    label: "Received",
    icon: PackageCheck,
    tone: "blue",
    permission: "replacements.receive",
  },
  {
    value: "DELIVERED",
    label: "Delivered",
    icon: CheckCheck,
    tone: "green",
    permission: "replacements.deliver",
  },
] as const;
const columns = [
  "#",
  "কেস নং",
  "ইনভয়েস নং",
  "পণ্য",
  "সিরিয়াল নং",
  "গ্রাহক",
  "জমার তারিখ",
  "স্ট্যাটাস",
  "অ্যাকশন",
];

export function ReplacementCases({
  preview,
  view,
}: {
  preview: boolean;
  view: string;
}) {
  const user = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(
    view === "dispatch" ? "SENT" : view === "receipts" ? "RECEIVED" : "all",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updates, setUpdates] = useState<
    Record<string, { version: number; status: ReplacementStage }>
  >({});
  const params = new URLSearchParams({
    q: search,
    status,
    page: String(page),
    pageSize: String(pageSize),
  });
  const resource = useCatalogResource<ReplacementList>(
    preview ? null : `/replacements?${params}`,
    revision,
    true,
  );
  const items = (resource.data?.items ?? []).map((item) => {
    const update = updates[item.id];
    return update && update.version > item.version
      ? { ...item, ...update }
      : item;
  });
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const summary = resource.data ? { ...resource.data.summary } : null;
  if (summary)
    for (const original of resource.data!.items) {
      const update = updates[original.id];
      if (
        update &&
        update.version > original.version &&
        update.status !== original.status
      ) {
        summary[original.status]--;
        summary[update.status]++;
      }
    }
  const pages = Math.max(1, Math.ceil((resource.data?.total ?? 0) / pageSize));
  async function changeStatus(item: ReplacementCase, next: ReplacementStage) {
    if (savingId || next === item.status || preview) return;
    setSavingId(item.id);
    setError("");
    setMessage("");
    try {
      const saved = await post<{
        id: string;
        status: ReplacementStage;
        version: number;
      }>(`/replacements/${item.id}/status`, {
        status: next,
        version: item.version,
      });
      setUpdates((previous) => ({ ...previous, [item.id]: saved }));
      setMessage(
        `${item.number}: ${stages.find((stage) => stage.value === saved.status)!.label}`,
      );
      setRevision((value) => value + 1);
      notifyDashboardUpdate();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Status could not be saved.",
      );
    } finally {
      setSavingId(null);
    }
  }
  const detailRows = [
    [
      "স্ট্যাটাস",
      selected
        ? stages.find((stage) => stage.value === selected.status)!.label
        : null,
    ],
    ["গ্রাহকের নাম", selected?.customer],
    ["যোগাযোগ", selected?.phone],
    ["পণ্য", selected?.product],
    ["সিরিয়াল নং", selected?.serial],
    ["ইনভয়েস নং", selected?.invoice],
    ["জমার তারিখ", selected ? businessDate(selected.createdAt) : null],
    [
      "কোম্পানিতে পাঠানোর তারিখ",
      selected?.sentAt ? businessDate(selected.sentAt) : null,
    ],
  ];
  return (
    <>
      <div className="erp-stats replacement-stats">
        {stages.map((stage) => (
          <StatCard
            key={stage.value}
            label={stage.label}
            value={summary ? String(summary[stage.value]) : "—"}
            icon={stage.icon}
            tone={stage.tone}
          />
        ))}
      </div>
      {view === "policy" ? (
        <Panel>
          <EmptyTable
            columns={["কোম্পানি", "পণ্যের ধরন", "ওয়ারেন্টি", "নীতি", "স্ট্যাটাস"]}
          />
          <Pager />
        </Panel>
      ) : view !== "new" ? (
        <>
          <Panel className="mb-4">
            <div className="erp-filterbar">
              <label className="erp-search">
                <Search size={19} />
                <input
                  aria-label="Search replacements"
                  placeholder="ইনভয়েস, সিরিয়াল, গ্রাহকের নাম দিয়ে খুঁজুন..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <select
                className="erp-select"
                aria-label="Record status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">স্ট্যাটাস: সকল</option>
                {stages.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
              <Button asChild className="erp-button">
                <Link href={workspaceHref("replacements", "new", preview)}>
                  <Plus />
                  নতুন রিপ্লেসমেন্ট
                </Link>
              </Button>
            </div>
          </Panel>
          {message ? (
            <p role="status" className="mb-3 text-sm text-green-700">
              {message}
            </p>
          ) : null}
          {error || resource.error ? (
            <div
              role="alert"
              className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              <span>{error || resource.error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError("");
                  setRevision((value) => value + 1);
                }}
              >
                Refresh
              </Button>
            </div>
          ) : null}
          <div className="master-detail-layout">
            <Panel>
              <div className="erp-table-wrap">
                <table className="erp-table" aria-busy={resource.loading}>
                  <caption className="sr-only">Replacement cases</caption>
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
                    {items.length ? (
                      items.map((item, index) => (
                        <tr
                          key={item.id}
                          className={
                            selectedId === item.id ? "bg-green-50" : undefined
                          }
                        >
                          <td>{(page - 1) * pageSize + index + 1}</td>
                          <td>{item.number}</td>
                          <td>{item.invoice ?? "—"}</td>
                          <td>{item.product}</td>
                          <td>{item.serial}</td>
                          <td>{item.customer ?? "—"}</td>
                          <td>{businessDate(item.createdAt)}</td>
                          <td>
                            <select
                              className="replacement-status"
                              aria-label={`Status for ${item.number}`}
                              value={item.status}
                              disabled={
                                preview ||
                                Boolean(savingId) ||
                                !stages.some((stage) =>
                                  user?.permissions.includes(stage.permission),
                                )
                              }
                              onChange={(event) =>
                                void changeStatus(
                                  item,
                                  event.target.value as ReplacementStage,
                                )
                              }
                            >
                              {stages.map((stage) => (
                                <option
                                  key={stage.value}
                                  value={stage.value}
                                  disabled={
                                    !user?.permissions.includes(
                                      stage.permission,
                                    )
                                  }
                                >
                                  {stage.label}
                                </option>
                              ))}
                            </select>
                            {savingId === item.id ? (
                              <span
                                role="status"
                                className="ml-2 text-xs text-slate-500"
                              >
                                Saving…
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Details for ${item.number}`}
                              onClick={() => setSelectedId(item.id)}
                            >
                              <Eye size={16} />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={columns.length}>
                          <p
                            role="status"
                            className="py-16 text-center text-sm text-slate-500"
                          >
                            {resource.loading
                              ? "Loading records…"
                              : "No records to display"}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="erp-pagination">
                <label>
                  প্রতি পাতায় দেখান:{" "}
                  <select
                    aria-label="Rows per page"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {[10, 25, 50].map((size) => (
                      <option key={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || resource.loading}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Previous
                  </Button>
                  <span>
                    {page} / {pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pages || resource.loading}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Panel>
            <Panel title="Replacement Details" className="erp-details">
              <dl>
                {detailRows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      <span>:</span> {value ?? "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}
