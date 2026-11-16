"use client";
import { ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/reference-ui";
import { money } from "@/lib/utils";
import type { ExpenseList } from "@/lib/api";
import { useEffect, useRef } from "react";

export function ExpensesPanel({
  data,
  loading,
  error,
  page,
  pages,
  canAdd,
  onAdd,
  onPage,
  onRetry,
  onPageSize,
}: {
  data: ExpenseList | null;
  loading: boolean;
  error: string;
  page: number;
  pages: number;
  canAdd: boolean;
  onAdd: () => void;
  onPage: (page: number) => void;
  onRetry: () => void;
  onPageSize: (size: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousCapacity = useRef(0);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => {
      if (!body.clientHeight) return;
      const capacity = Math.min(
        100,
        Math.max(1, Math.floor((body.clientHeight - 30 - 18) / 32)),
      );
      if (capacity !== previousCapacity.current) {
        previousCapacity.current = capacity;
        onPageSize(capacity);
      }
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [onPageSize]);
  return (
    <Panel
      title="Expenses"
      icon={FileText}
      className="expenses-panel"
      action={
        <Button type="button" size="sm" onClick={onAdd} disabled={!canAdd}>
          <Plus />
          Add Expense
        </Button>
      }
    >
      {error ? (
        <div
          role="alert"
          className="mx-3 mb-3 flex items-center justify-between gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"
        >
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className="expenses-body" ref={bodyRef}>
        <div className="erp-table-wrap">
          <table className="erp-table expenses-table">
            <colgroup>
              {[22, 24, 30, 24].map((width, index) => (
                <col key={index} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <caption className="sr-only">Expenses</caption>
            <thead>
              <tr>
                {["Date", "Category", "Challan No.", "Amount (৳)"].map(
                  (label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.date}</td>
                  <td>{expense.category}</td>
                  <td
                    className="expense-description"
                    title={expense.challanNumber ?? undefined}
                  >
                    {expense.challanNumber || "—"}
                  </td>
                  <td className="text-right font-semibold">
                    {money(expense.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.items.length ? (
          <div className="erp-empty expenses-empty" role="status">
            <FileText />
            <p>
              {loading
                ? "Loading expenses..."
                : error
                  ? "Unable to load expenses"
                  : "No expenses yet"}
            </p>
            <span>খরচ যোগ করলে এখানে দেখা যাবে।</span>
          </div>
        ) : null}
      </div>
      <div className="erp-pager">
        <span>
          {data?.total ?? 0} expenses · Page {page} / {pages}
        </span>
        <div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous expenses page"
            disabled={loading || page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next expenses page"
            disabled={loading || page >= pages}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </Panel>
  );
}
