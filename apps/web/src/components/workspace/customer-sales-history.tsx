"use client";
import { useState } from "react";
import { Dialog } from "radix-ui";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CustomerRecord,
  CustomerSalesHistory,
  SalesList,
} from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { businessDate, money } from "@/lib/utils";

export function CustomerSalesHistoryDialog({
  customer,
  sale,
  preview,
  onClose,
  returnFocus,
}: {
  customer: Pick<CustomerRecord, "id" | "name" | "phone"> &
    Partial<CustomerRecord>;
  sale?: Pick<SalesList["items"][number], "id" | "total" | "paid" | "due">;
  preview: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const history = useCatalogResource<CustomerSalesHistory>(
    preview
      ? null
      : `/customers/${customer.id}/sales?page=${page}&pageSize=10${sale ? "&saleId=" + encodeURIComponent(sale.id) : ""}`,
    revision,
  );
  const details = history.data?.customer ?? customer;
  const pages = Math.max(1, Math.ceil((history.data?.total ?? 0) / 10));
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
        <Dialog.Content
          className="feature-dialog customer-history-dialog"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus();
          }}
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-bold">
                {sale ? "Sale Details" : "Customer Details"} — {details.name}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close customer details"
              >
                <X />
              </Button>
            </Dialog.Close>
          </header>
          <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
            <div className="customer-history-contact mb-4 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs text-slate-500">Mobile</p>
                <p className="mt-1 break-words text-sm font-medium">
                  {details.phone}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Address</p>
                <p className="mt-1 break-words text-sm">
                  {details.address || "—"}
                </p>
              </div>
            </div>
            <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
              {(sale
                ? [
                    ["Invoice Total", money(sale.total)],
                    ["Paid", money(sale.paid)],
                    ["Due", money(sale.due)],
                  ]
                : [
                    [
                      "Invoices",
                      history.data ? String(history.data.total) : "—",
                    ],
                    ["Total Sales", money(details.totalSales)],
                    ["Outstanding Due", money(details.due)],
                  ]
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-xl border border-slate-200 p-3"
                >
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 break-words text-sm font-bold sm:text-lg">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <ReceiptText size={18} className="text-green-700" />
              {sale ? "Sold Products" : "Sales History"}
            </h2>
            {history.error ? (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                <span>{history.error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Retry
                </Button>
              </div>
            ) : null}
            <div className="grid gap-4" aria-busy={history.loading}>
              {history.data?.items.map((sale) => (
                <article
                  key={sale.id}
                  className="overflow-hidden rounded-xl border border-slate-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <h3 className="text-sm font-bold">
                        {sale.invoiceNumber ?? "Invoice"}
                      </h3>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarDays size={13} />
                        <time dateTime={sale.soldAt ?? undefined}>
                          {sale.soldAt
                            ? businessDate(sale.soldAt)
                            : "Date unavailable"}
                        </time>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{money(sale.total)}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {(
                          {
                            CONFIRMED: "Confirmed",
                            PARTIALLY_RETURNED: "Partially returned",
                            RETURNED: "Returned",
                          } as Record<string, string>
                        )[sale.status] ?? sale.status}
                      </p>
                    </div>
                  </div>
                  <div className="erp-table-wrap">
                    <table className="erp-table min-w-[600px]">
                      <caption className="sr-only">
                        Products sold on invoice {sale.invoiceNumber ?? sale.id}
                      </caption>
                      <thead>
                        <tr>
                          {[
                            "Product",
                            "Model",
                            "Qty",
                            "Unit Price",
                            "Amount",
                          ].map((label) => (
                            <th key={label} scope="col">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sale.products.map((product) => (
                          <tr key={product.id}>
                            <td className="font-medium">{product.name}</td>
                            <td>{product.model || "—"}</td>
                            <td className="whitespace-nowrap">
                              {product.quantity} {product.unit}
                            </td>
                            <td className="whitespace-nowrap">
                              {money(product.unitPrice)}
                            </td>
                            <td className="whitespace-nowrap font-semibold">
                              {money(product.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th
                            scope="row"
                            colSpan={4}
                            style={{ textAlign: "right" }}
                          >
                            Invoice Total:
                          </th>
                          <td className="whitespace-nowrap font-semibold text-slate-900">
                            {money(sale.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </article>
              ))}
              {!history.data?.items.length && !history.error ? (
                <p
                  role="status"
                  className="rounded-xl border border-slate-200 px-4 py-10 text-center text-sm text-slate-500"
                >
                  {history.loading
                    ? "Loading sales history…"
                    : preview
                      ? "Sign in to view sales history."
                      : "No sales recorded for this customer."}
                </p>
              ) : null}
            </div>
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            <span className="text-xs text-slate-500">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={history.loading || page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft size={16} />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={history.loading || !history.data || page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
                <ChevronRight size={16} />
              </Button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
