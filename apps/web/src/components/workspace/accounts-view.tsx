"use client";
import { useCallback, useState } from "react";
import {
  ChartColumnIncreasing,
  ChartPie,
  FileText,
  List,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  EmptyTable,
  ModuleTabs,
  Panel,
  StatCard,
} from "@/components/reference-ui";
import { money } from "@/lib/utils";
import type { DashboardData, ExpenseList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { ExpenseDialog } from "./expense-dialog";
import { ExpenseDonut } from "./expense-donut";
import { ExpensesPanel } from "./expenses-panel";
import { cents, decimalAmount } from "@/lib/purchase-amounts";
export function AccountsView({
  preview,
  view = "",
  data,
}: {
  preview: boolean;
  view?: string;
  data: DashboardData | null;
}) {
  const user = useSession();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expensePage, setExpensePage] = useState(1);
  const [expensePageSize, setExpensePageSize] = useState(3);
  const [mobilePanel, setMobilePanel] = useState("expenses");
  const [transactionPage, setTransactionPage] = useState(1);
  const [companySearch, setCompanySearch] = useState("");
  const resizeExpensePage = useCallback((size: number) => {
    setExpensePageSize(size);
    setExpensePage(1);
  }, []);
  const [expenseRevision, setExpenseRevision] = useState(0);
  const expenses = useCatalogResource<ExpenseList>(
    preview
      ? null
      : `/expenses?page=${expensePage}&pageSize=${expensePageSize}`,
    expenseRevision,
    true,
  );
  const canAddExpense =
    preview || Boolean(user?.permissions.includes("finance.write"));
  const expensePages = Math.max(
    1,
    Math.ceil((expenses.data?.total ?? 0) / expensePageSize),
  );
  const categoryTotals = [
    ["Office Expense", "#2f8eef"],
    ["Transport", "#f59b00"],
    ["Others", "#8050cd"],
  ].map(([label, color]) => ({
    label,
    color,
    amount: cents(
      expenses.data?.summary.byCategory.find(
        (category) => category.name === label,
      )?.amount ?? "0",
    ),
  }));
  const totalCents = categoryTotals.reduce(
    (sum, category) => sum + category.amount,
    BigInt(0),
  );
  const expenseChartTotal = expenses.data ? decimalAmount(totalCents) : null;
  const companyTransactions = (
    preview ? [] : (data?.financials?.companyTransactions ?? [])
  ).filter((transaction) =>
    transaction.company
      .toLocaleLowerCase()
      .includes(companySearch.trim().toLocaleLowerCase()),
  );
  const transactionPages = Math.max(
    1,
    Math.ceil(companyTransactions.length / 2),
  );
  const currentTransactionPage = Math.min(transactionPage, transactionPages);
  const visibleTransactions = companyTransactions.slice(
    (currentTransactionPage - 1) * 2,
    currentTransactionPage * 2,
  );
  const current = ["transactions", "categories", "reports"].includes(view)
    ? view
    : "summary";
  return (
    <section className="accounts-workspace" data-panel={mobilePanel}>
      {view ? (
        <ModuleTabs
          moduleId="accounts"
          current={current}
          preview={preview}
          items={[
            { id: "summary", label: "Account Summary", icon: Wallet },
            { id: "transactions", label: "Transactions", icon: List },
            { id: "categories", label: "Expense Summary", icon: ChartPie },
            { id: "reports", label: "Reports", icon: ChartColumnIncreasing },
          ]}
        />
      ) : null}
      <div className="erp-stats accounts-stats">
        <StatCard
          label="Sales Income"
          value={money(
            preview
              ? null
              : (data?.financials?.salesIncome ?? data?.financials?.todaySales),
          )}
          icon={Wallet}
        />
        <StatCard
          label="Total Profit"
          value={money(
            preview
              ? null
              : (data?.financials?.salesProfit ??
                  data?.financials?.grossProfit),
          )}
          icon={ChartColumnIncreasing}
        />
        <StatCard
          label="Total Expenses"
          value={money(preview ? null : expenses.data?.summary.total)}
          icon={FileText}
          tone="red"
        />
        <StatCard
          label="Total Transactions"
          value={money(
            preview ? null : data?.financials?.companyTransactionAmount,
          )}
          icon={ChartColumnIncreasing}
          tone="purple"
        />
      </div>
      <nav className="accounts-mobile-panels" aria-label="Accounts panels">
        {[
          ["expenses", "Expenses"],
          ["transactions", "Transactions"],
          ["categories", "Expense Summary"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={mobilePanel === id}
            onClick={() => setMobilePanel(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="accounts-chart-grid">
        <ExpensesPanel
          data={expenses.data}
          loading={expenses.loading}
          error={expenses.error}
          page={expensePage}
          pages={expensePages}
          canAdd={canAddExpense}
          onAdd={() => setExpenseOpen(true)}
          onPage={setExpensePage}
          onRetry={() => setExpenseRevision((value) => value + 1)}
          onPageSize={resizeExpensePage}
        />
        <Panel
          title="Expense Summary"
          icon={ChartPie}
          className="accounts-category-panel"
        >
          <div className="donut-layout">
            <ExpenseDonut
              categories={categoryTotals}
              totalLabel={money(preview ? null : expenseChartTotal)}
            />
            <div className="donut-legend">
              {categoryTotals.map(({ label, color, amount }) => (
                <div key={label}>
                  <i style={{ background: color }} />
                  <span>{label}</span>
                  <span>
                    {money(
                      preview
                        ? null
                        : expenses.data
                          ? decimalAmount(amount)
                          : "0.00",
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel
          title={current === "categories" ? "Expense Summary" : "Transactions"}
          icon={List}
          className="accounts-transactions-panel"
          action={
            <input
              type="search"
              aria-label="Search company"
              placeholder="Search company..."
              className="accounts-company-search w-36 min-w-0 rounded-md border bg-white px-2 py-1 text-xs"
              value={companySearch}
              onChange={(event) => {
                setCompanySearch(event.target.value);
                setTransactionPage(1);
              }}
            />
          }
        >
          {current !== "categories" && companyTransactions.length ? (
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr>
                    {["Date", "Company", "Challan No.", "Amount"].map(
                      (label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{transaction.date}</td>
                      <td title={transaction.company}>{transaction.company}</td>
                      <td title={transaction.challanNumber ?? undefined}>
                        {transaction.challanNumber || "—"}
                      </td>
                      <td>{money(transaction.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyTable
              title={
                companySearch.trim()
                  ? "No matching company transactions"
                  : "No company transactions yet"
              }
              columns={
                current === "categories"
                  ? ["Category", "Account", "Status", "Action"]
                  : ["Date", "Company", "Challan No.", "Amount"]
              }
              description="কোম্পানির পেমেন্ট ও রিফান্ড এখানে দেখা যাবে।"
            />
          )}
          {current !== "categories" && transactionPages > 1 ? (
            <div className="erp-pager">
              <span>
                Page {currentTransactionPage} / {transactionPages}
              </span>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Previous transactions page"
                  disabled={currentTransactionPage <= 1}
                  onClick={() => setTransactionPage(currentTransactionPage - 1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Next transactions page"
                  disabled={currentTransactionPage >= transactionPages}
                  onClick={() => setTransactionPage(currentTransactionPage + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
      <ExpenseDialog
        preview={preview}
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        onSaved={() => {
          setExpensePage(1);
          setMobilePanel("expenses");
          setExpenseRevision((value) => value + 1);
        }}
      />
    </section>
  );
}
