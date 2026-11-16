"use client";
import Link from "next/link";
import { useState } from "react";
import { Dialog } from "radix-ui";
import {
  ArrowLeftRight,
  ArrowRight,
  BatteryCharging,
  Boxes,
  CalendarDays,
  ChartColumnIncreasing,
  CheckCheck,
  Clock3,
  Package,
  Plus,
  ShoppingBag,
  ShoppingCart,
  TriangleAlert,
  Truck,
  UserRoundCheck,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { businessDate, money } from "@/lib/utils";
import { todayInDhaka, useDashboardData } from "@/lib/use-dashboard";
import {
  EmptyTable,
  Field,
  Panel,
  StatCard,
  workspaceHref,
} from "@/components/reference-ui";
import type { DashboardData } from "@/lib/api";

export function SalesChart({
  data,
  from,
  to,
  finance = true,
}: {
  data: DashboardData | null;
  from: string;
  to: string;
  finance?: boolean;
}) {
  const points = data?.salesTrend ?? [];
  const maximum = Math.max(
    ...points.flatMap((point) => [
      Math.abs(Number(point.amount)),
      Math.abs(Number(point.grossProfit ?? 0)),
    ]),
    1,
  );
  return (
    <Panel
      title={finance ? "বিক্রয় ও লাভের চিত্র" : "অপারেশন সারসংক্ষেপ"}
      action={
        finance ? (
          <div className="chart-legend">
            <span>
              <i />
              বিক্রয় (Sales)
            </span>
            <span>
              <i className="blue" />
              লাভ (Gross Profit)
            </span>
          </div>
        ) : undefined
      }
    >
      <div className="reference-chart">
        <span className="chart-axis-currency">{finance ? "৳" : ""}</span>
        <span className="chart-axis-label">0</span>
        {points.length && finance ? (
          <div className="sales-chart-bars flex h-55 items-end justify-around gap-3 px-4 pt-7">
            {points.map((point) => (
              <div
                key={point.date}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
              >
                <span className="text-[10px] font-semibold">
                  {money(point.amount)}
                </span>
                <div className="flex h-[75%] w-full items-end justify-center gap-1">
                  {[
                    {
                      label: "Sales",
                      value: point.amount,
                      color: "from-emerald-500 to-green-300",
                    },
                    ...(point.grossProfit == null
                      ? []
                      : [
                          {
                            label: "Gross profit",
                            value: point.grossProfit,
                            color: "from-blue-600 to-blue-400",
                          },
                        ]),
                  ].map((series) => (
                    <div
                      key={series.label}
                      title={`${series.label}: ${money(series.value)}`}
                      className={`w-full max-w-8 rounded-t bg-linear-to-t ${Number(series.value) < 0 ? "from-red-600 to-red-400" : series.color}`}
                      style={{
                        height:
                          Math.max(
                            1,
                            (Math.abs(Number(series.value)) / maximum) * 100,
                          ) + "%",
                      }}
                    />
                  ))}
                </div>
                <span className="text-[9px] text-slate-500">
                  {point.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="chart-empty">
            <ChartColumnIncreasing size={34} strokeWidth={1.2} />
            <strong>
              {finance ? "এই সময়ে বিক্রয়ের তথ্য নেই" : "ওয়ার্কস্পেস প্রস্তুত"}
            </strong>
            <span>
              {finance
                ? "নিশ্চিত লেনদেনের পর বিক্রয় ও প্রকৃত লাভের চিত্র দেখা যাবে।"
                : "পণ্য ও স্টকের তথ্য যুক্ত হলে এখানে সারসংক্ষেপ দেখাবে।"}
            </span>
          </div>
        )}
      </div>
      <p className="chart-date-label">
        {businessDate(from)}
        {from !== to ? " — " + businessDate(to) : ""} · Asia/Dhaka
      </p>
    </Panel>
  );
}
export function QuickLinks({ preview = false }: { preview?: boolean }) {
  const user = useSession();
  return (
    <Panel title="দ্রুত লিংক">
      <div className="erp-quick-grid">
        {[
          {
            title: "নতুন বিক্রয়",
            english: "New Sale",
            icon: ShoppingCart,
            module: "sales",
            view: "new",
            tone: "",
            permission: "sales.manage",
          },
          {
            title: "নতুন ক্রয়",
            english: "New Purchase",
            icon: ShoppingBag,
            module: "purchases",
            view: "new",
            tone: "blue",
            permission: "purchases.manage",
          },
          {
            title: "স্টক দেখুন",
            english: "Inventory / Stock",
            icon: Package,
            module: "inventory",
            view: "",
            tone: "purple",
            permission: "inventory.read",
          },
          {
            title: "রিপ্লেসমেন্ট যোগ",
            english: "Add Replacement",
            icon: ArrowLeftRight,
            module: "replacements",
            view: "new",
            tone: "orange",
            permission: "replacements.intake.customer",
          },
        ]
          .filter(
            (item) => preview || user?.permissions.includes(item.permission),
          )
          .map((item) => (
            <Link
              key={item.module}
              href={workspaceHref(item.module, item.view, preview)}
              className={"erp-quick-link " + item.tone}
            >
              <item.icon strokeWidth={1.8} />
              <strong>
                {item.title}
                <small className="block">({item.english})</small>
              </strong>
            </Link>
          ))}
      </div>
    </Panel>
  );
}
export function Dashboard({ preview = false }: { preview?: boolean }) {
  const user = useSession();
  const today = todayInDhaka();
  const [period, setPeriod] = useState("today");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ from: today, to: today });
  const start = new Date(today + "T12:00:00Z");
  start.setUTCDate(
    start.getUTCDate() - (period === "week" ? 6 : period === "month" ? 29 : 0),
  );
  const from =
    period === "custom" ? custom.from : start.toISOString().slice(0, 10);
  const to = period === "custom" ? custom.to : today;
  const { data, error, loading, refresh } = useDashboardData({
    preview,
    from,
    to,
  });
  const finance = preview || user?.permissions.includes("finance.read");
  const count = (value?: string | number) =>
    value == null || preview ? "—" : String(value);
  const taka = (value?: string) => money(preview ? null : value);
  const has = (permission: string) =>
    preview || user?.permissions.includes(permission);
  return (
    <div className="dashboard-page">
      <div className="dashboard-intro">
        <div>
          <h2>
            স্বাগতম, {preview ? "Admin" : (user?.name ?? "Admin")}{" "}
            <span aria-hidden="true">👋</span>
          </h2>
          <p>আজকের ব্যবসার সারসংক্ষেপ দেখুন</p>
        </div>
        <div
          className="date-pills"
          role="group"
          aria-label="Dashboard date range"
        >
          {[
            ["today", "আজ"],
            ["week", "এই সপ্তাহ"],
            ["month", "এই মাস"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={period === value ? "active" : ""}
              onClick={() => setPeriod(value)}
              aria-pressed={period === value}
            >
              {label}
            </button>
          ))}
          <Dialog.Root open={customOpen} onOpenChange={setCustomOpen}>
            <Dialog.Trigger asChild>
              <button
                className={
                  "custom-range " + (period === "custom" ? "active" : "")
                }
              >
                কাস্টম রেঞ্জ
                <CalendarDays size={15} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
              <Dialog.Content className="feature-dialog">
                <Dialog.Title className="text-xl font-bold">
                  তারিখ নির্বাচন করুন
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-xs text-slate-500">
                  Asia/Dhaka সময় অনুযায়ী সারসংক্ষেপ দেখুন।
                </Dialog.Description>
                <form
                  className="mt-5 grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const fields = new FormData(event.currentTarget);
                    setCustom({
                      from: String(fields.get("from")),
                      to: String(fields.get("to")),
                    });
                    setPeriod("custom");
                    setCustomOpen(false);
                  }}
                >
                  <Field label="শুরুর তারিখ">
                    <input
                      type="date"
                      name="from"
                      required
                      defaultValue={custom.from}
                      max={custom.to}
                    />
                  </Field>
                  <Field label="শেষ তারিখ">
                    <input
                      type="date"
                      name="to"
                      required
                      defaultValue={custom.to}
                      min={custom.from}
                    />
                  </Field>
                  <Button type="submit">সারসংক্ষেপ দেখুন</Button>
                </form>
                <Dialog.Close
                  className="absolute top-4 right-4"
                  aria-label="Close date range"
                >
                  <X size={18} />
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
        <div className="dashboard-actions">
          {has("sales.manage") ? (
            <Button asChild className="erp-button">
              <Link href={workspaceHref("sales", "new", preview)}>
                <Plus />
                New Sale
              </Link>
            </Button>
          ) : null}
          {has("purchases.manage") ? (
            <Button asChild variant="outline" className="erp-button">
              <Link href={workspaceHref("purchases", "new", preview)}>
                <Plus />
                New Purchase
              </Link>
            </Button>
          ) : null}
          {has("replacements.intake.customer") ? (
            <Button asChild variant="outline" className="erp-button">
              <Link href={workspaceHref("replacements", "new", preview)}>
                <ArrowLeftRight />
                Add Replacement
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={refresh}>
            আবার চেষ্টা করুন
          </Button>
        </div>
      ) : null}
      <div
        className="erp-stats"
        data-finance={Boolean(finance)}
        aria-busy={loading}
      >
        {finance ? (
          <>
            <StatCard
              label="মোট বিক্রয়"
              value={taka(data?.financials?.todaySales)}

              icon={ShoppingCart}
            />
            <StatCard
              label="স্টকের ক্রয়মূল্য"
              value={taka(data?.financials?.availableStockPurchaseValue)}

              icon={Boxes}
              tone="blue"
            />
            <StatCard
              label="কাস্টমার বাকি"
              value={taka(data?.financials?.customerDues)}

              icon={Wallet}
              tone="orange"
            />
            <StatCard
              label="কোম্পানির বাকি"
              value={taka(data?.financials?.supplierDues)}

              icon={Truck}
              tone="purple"
            />
          </>
        ) : (
          <>
            <StatCard
              label="সক্রিয় পণ্য"
              value={count(data?.counts.products)}
              icon={Package}
            />
            <StatCard
              label="কাস্টমার"
              value={count(data?.counts.customers)}
              icon={Users}
              tone="blue"
            />
            <StatCard
              label="বিক্রয়যোগ্য স্টক"
              value={count(data?.counts.availableStock)}
              icon={Boxes}
            />
            <StatCard
              label="কম স্টক পণ্য"
              value={count(data?.counts.lowStock)}
              icon={TriangleAlert}
              tone="orange"
            />
            <StatCard
              label="পেন্ডিং রিপ্লেসমেন্ট"
              value={count(data?.counts.pendingReplacements)}
              icon={ArrowLeftRight}
              tone="purple"
            />
          </>
        )}
      </div>
      <div className="dashboard-middle">
        <SalesChart
          data={data}
          from={from}
          to={to}
          finance={Boolean(finance)}
        />
        <Panel title="স্টক সারসংক্ষেপ">
          <div className="summary-stack">
            {[
              {
                label: "ব্যাটারি",
                english: "Available",
                value: data?.stock?.batteriesAvailable,
                icon: BatteryCharging,
                tone: "",
              },
              {
                label: "পার্টস / অন্যান্য",
                english: "Available",
                value: data?.stock?.partsAvailable,
                icon: Wrench,
                tone: "slate",
              },
              {
                label: "কম স্টক পণ্য",
                english: "Low Stock",
                value: data?.counts.lowStock,
                icon: TriangleAlert,
                tone: "orange",
              },
              {
                label: "রিপ্লেসেবল",
                english: "বিক্রয়যোগ্য নয়",
                value: data?.stock?.replaceable,
                icon: Package,
                tone: "red",
              },
            ].map((item) => (
              <div className={"summary-line " + item.tone} key={item.label}>
                <item.icon />
                <span>
                  {item.label} <small>({item.english})</small>
                </span>
                <strong>{count(item.value)} টি</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="রিপ্লেসমেন্ট স্ট্যাটাস" icon={ArrowLeftRight}>
          <div className="summary-stack">
            {[
              {
                label: "পাঠানোর অপেক্ষায়",
                english: "Pending Return",
                value: data?.replacementStages?.pendingReturn,
                icon: Clock3,
                tone: "purple",
              },
              {
                label: "কোম্পানিতে পাঠানো হয়েছে",
                english: "Sent to Company",
                value: data?.replacementStages?.sentToCompany,
                icon: Truck,
                tone: "blue",
              },
              {
                label: "রিপ্লেসমেন্ট পাওয়া গেছে",
                english: "Replacement Received",
                value: data?.replacementStages?.received,
                icon: CheckCheck,
                tone: "",
              },
              {
                label: "কাস্টমারকে দেওয়ার জন্য প্রস্তুত",
                english: "Ready for Delivery",
                value: data?.replacementStages?.readyForDelivery,
                icon: UserRoundCheck,
                tone: "orange",
              },
            ].map((item) => (
              <div className={"summary-line " + item.tone} key={item.english}>
                <item.icon />
                <span>
                  {item.label}
                  <small className="block">({item.english})</small>
                </span>
                <strong>{count(item.value)} টি</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="dashboard-bottom">
        <Panel
          title="সাম্প্রতিক বিক্রয় (Recent Sales)"
          action={
            <Link
              className="flex items-center gap-2 text-xs font-semibold text-sky-800"
              href={workspaceHref("sales", "list", preview)}
            >
              সবগুলো দেখুন
              <ArrowRight size={16} />
            </Link>
          }
        >
          {data?.recentSales.length ? (
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr>
                    {["ইনভয়েস", "তারিখ", "কাস্টমার", "মোট টাকা", "স্ট্যাটাস"].map(
                      (label) => (
                        <th key={label}>{label}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.slice(0, 3).map((sale) => (
                    <tr key={sale.id}>
                      <td>{sale.invoiceNumber}</td>
                      <td>
                        {sale.soldAt
                          ? businessDate(sale.soldAt.slice(0, 10))
                          : "—"}
                      </td>
                      <td>{sale.customer}</td>
                      <td>{money(sale.total)}</td>
                      <td>{sale.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyTable
              title="No invoices yet"
              description="নিশ্চিত বিক্রয়ের পর ইনভয়েস ও পরিশোধের তথ্য এখানে দেখা যাবে।"
              columns={[
                "ইনভয়েস",
                "তারিখ",
                "কাস্টমার",
                "পণ্য (পরিমাণ)",
                "মোট টাকা",
                "পরিশোধ",
                "অবশিষ্ট",
                "স্ট্যাটাস",
              ]}
            />
          )}
        </Panel>
        <QuickLinks preview={preview} />
      </div>
      <div className="dashboard-meta flex flex-wrap justify-between gap-2 text-[10px] text-slate-400">
        <span>
          Cash received:{" "}
          {finance
            ? taka(data?.financials?.todayCashReceived)
            : "শুধু অনুমোদিত ব্যবহারকারীর জন্য"}
        </span>
        <span>
          {preview
            ? "UI preview · no business data"
            : "লাইভ ডেটাবেস · কোনো নমুনা রেকর্ড নয়"}
        </span>
      </div>
    </div>
  );
}
