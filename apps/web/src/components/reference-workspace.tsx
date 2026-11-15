"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/lib/use-dashboard";
import { CatalogView } from "@/components/workspace/catalog-view";
import {
  CustomerView,
  ReplacementView,
} from "@/components/workspace/lists-view";
import { SalesView } from "@/components/workspace/sales-view";
import { CustomersView } from "@/components/workspace/customers-view";
import { AccountsView } from "@/components/workspace/accounts-view";
import { SupplierView } from "@/components/workspace/suppliers-view";
import { PurchasesView } from "@/components/workspace/purchases-view";
import { RecycleBinView } from "@/components/workspace/recycle-bin-view";
export const referenceModules = [
  "products",
  "purchases",
  "inventory",
  "sales",
  "replacements",
  "customers",
  "suppliers",
  "accounts",
  "recycle-bin",
];
export function ReferenceWorkspace({
  moduleId,
  preview = false,
  view = "",
  loading = false,
  error = "",
  denied = false,
  initialCustomerId,
}: {
  moduleId: string;
  preview?: boolean;
  view?: string;
  loading?: boolean;
  error?: string;
  denied?: boolean;
  initialCustomerId?: string;
}) {
  const { data } = useDashboardData({
    preview,
    enabled:
      !loading &&
      !denied &&
      moduleId !== "products" &&
      moduleId !== "inventory" &&
      moduleId !== "recycle-bin" &&
      moduleId !== "sales" &&
      moduleId !== "customers" &&
      moduleId !== "purchases",
  });
  if (denied)
    return (
      <section role="alert" className="erp-panel p-6">
        <h2 className="text-xl font-bold">প্রবেশাধিকার নেই</h2>
        <p className="mt-3 text-sm text-slate-500">{error}</p>
      </section>
    );
  if (moduleId === "purchases")
    return (
      <PurchasesView
        preview={preview}
        view={view}
        loading={loading}
        moduleError={error}
      />
    );
  if (moduleId === "sales")
    return (
      <SalesView
        preview={preview}
        view={view}
        loading={loading}
        moduleError={error}
        initialCustomerId={initialCustomerId}
      />
    );
  if (loading)
    return (
      <div aria-busy="true" aria-label="Loading module" className="grid gap-5">
        <Skeleton className="h-12" />
        <Skeleton className="h-28" />
        <Skeleton className="h-80" />
      </div>
    );
  return (
    <>
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      {moduleId === "recycle-bin" ? (
        <RecycleBinView preview={preview} />
      ) : moduleId === "products" ? (
        <CatalogView preview={preview} />
      ) : moduleId === "customers" ? (
        <CustomersView preview={preview} view={view} />
      ) : moduleId === "inventory" ? (
        <CatalogView preview={preview} />
      ) : moduleId === "replacements" ? (
        <ReplacementView preview={preview} view={view} data={data} />
      ) : moduleId === "suppliers" && ["", "list", "new"].includes(view) ? (
        <SupplierView preview={preview} view={view} data={data} />
      ) : moduleId === "suppliers" ? (
        <CustomerView
          preview={preview}
          view={view}
          data={data}
          supplier={moduleId === "suppliers"}
        />
      ) : moduleId === "accounts" ? (
        <AccountsView preview={preview} view={view} data={data} />
      ) : null}
    </>
  );
}
