"use client";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChartColumnIncreasing,
  ChartPie,
  CheckCircle,
  Download,
  FileText,
  List,
  Plus,
  Scale,
  Wallet,
  Zap,
} from "lucide-react";
import {
  DesignAction,
  EmptyTable,
  FoundationNote,
  ModuleTabs,
  Panel,
  StatCard,
  workspaceHref,
} from "@/components/reference-ui";
import { money } from "@/lib/utils";
import type { DashboardData } from "@/lib/api";
export function AccountsView({
  preview,
  view = "",
  data,
}: {
  preview: boolean;
  view?: string;
  data: DashboardData | null;
}) {
  const current = ["transactions", "categories", "reports"].includes(view)
    ? view
    : "summary";
  return (
    <>
      {view ? (
        <ModuleTabs
          moduleId="accounts"
          current={current}
          preview={preview}
          items={[
            { id: "summary", label: "Account Summary", icon: Wallet },
            { id: "transactions", label: "Transactions", icon: List },
            { id: "categories", label: "Expense Categories", icon: ChartPie },
            { id: "reports", label: "Reports", icon: ChartColumnIncreasing },
          ]}
        />
      ) : null}
      <div className="erp-stats accounts-stats">
        <StatCard
          label="Sales Income"
          value={money(preview ? null : data?.financials?.todaySales)}
          caption="স্বীকৃত বিক্রয় আয় · এই সময়"
          icon={Wallet}
        />
        <StatCard
          label="Total Expenses"
          value="—"
          caption="ব্যয়ের হিসাব সংযুক্ত হলে দেখাবে"
          icon={FileText}
          tone="red"
        />
        <StatCard
          label="Current Cash Balance"
          value="—"
          caption="নগদ হিসাব সংযুক্ত হলে দেখাবে"
          icon={Scale}
          tone="blue"
        />
        <StatCard
          label="Total Transactions"
          value="—"
          caption="This Period"
          icon={ChartColumnIncreasing}
          tone="purple"
        />
      </div>
      <div className="accounts-chart-grid">
        <Panel
          title="Income vs Expenses"
          icon={ChartColumnIncreasing}
          action={
            <div className="chart-legend">
              <span>
                <i />
                Income
              </span>
              <span>
                <i className="blue" />
                Expenses
              </span>
            </div>
          }
        >
          <div className="reference-chart">
            <span className="chart-axis-label">0</span>
            <div className="chart-empty">
              <ChartColumnIncreasing size={35} />
              <strong>লেনদেনের তথ্য পাওয়া যায়নি</strong>
              <span>প্রকৃত আয় ও ব্যয়ের হিসাব যুক্ত হলে এখানে চিত্র দেখাবে।</span>
            </div>
          </div>
          <p className="chart-date-label">নির্বাচিত সময় · Asia/Dhaka</p>
        </Panel>
        <Panel title="Expense by Category" icon={ChartPie}>
          <div className="donut-layout">
            <div className="empty-donut">
              <strong>—</strong>
              <small>Total</small>
            </div>
            <div className="donut-legend">
              {[
                ["Office Expense", "#2f8eef"],
                ["Transport", "#f59b00"],
                ["Utilities", "#00a349"],
                ["Maintenance", "#8b5ce2"],
                ["Others", "#a3a7b2"],
              ].map(([label, color]) => (
                <div key={label}>
                  <i style={{ background: color }} />
                  <span>{label}</span>
                  <span>—</span>
                </div>
              ))}
            </div>
          </div>
          <p className="px-5 pb-5 text-center text-[10px] text-slate-400">
            কোনো নমুনা খরচ বা শতাংশ দেখানো হচ্ছে না।
          </p>
        </Panel>
      </div>
      <div className="accounts-bottom">
        <Panel
          title={
            current === "categories"
              ? "Expense Categories"
              : "Recent Transactions"
          }
          icon={List}
          action={
            <Link
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"
              href={workspaceHref("accounts", "transactions", preview)}
            >
              View All
              <ArrowRight size={14} />
            </Link>
          }
        >
          <EmptyTable
            columns={
              current === "categories"
                ? ["Category", "Account", "Status", "Action"]
                : [
                    "Date",
                    "Type",
                    "Description",
                    "Category",
                    "Amount",
                    "Remarks",
                    "Action",
                  ]
            }
            description="নিশ্চিত আয়, ব্যয় ও পেমেন্টের লেনদেন এখানে দেখা যাবে।"
          />
        </Panel>
        <aside className="grid content-start gap-3">
          <DesignAction icon={Plus}>Add Transaction</DesignAction>
          <Panel title="Quick Actions" icon={Zap}>
            <div className="quick-action-list">
              <DesignAction variant="ghost" icon={ArrowUp}>
                Record Income
              </DesignAction>
              <DesignAction variant="ghost" icon={ArrowDown}>
                Record Expense
              </DesignAction>
              <Link href={workspaceHref("reports", "", preview)}>
                <ChartColumnIncreasing size={17} />
                View Reports
              </Link>
              <DesignAction variant="ghost" icon={Download}>
                Export Statement
              </DesignAction>
            </div>
          </Panel>
          <div className="flex items-start gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
            <CheckCircle className="shrink-0 text-green-600" size={23} />
            <div>
              <strong className="text-xs text-green-800">
                হিসাবের ভিত্তি প্রস্তুত
              </strong>
              <p className="mt-1 text-[10px] leading-5 text-green-700">
                প্রকৃত লেনদেন ছাড়া ব্যালেন্স তৈরি করা হয় না।
              </p>
            </div>
          </div>
        </aside>
      </div>
      <FoundationNote />
    </>
  );
}
