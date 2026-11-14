"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export function PreviewContent() {
  const query = useSearchParams();
  const router = useRouter();
  const requested = query.get("module") ?? "dashboard";
  const requestedModule = Object.hasOwn(modules, requested)
    ? requested
    : "dashboard";
  const moduleId =
    requestedModule === "products" ? "inventory" : requestedModule;
  const view = query.get("view") ?? undefined;
  useEffect(() => {
    if (moduleId === "inventory" && view)
      router.replace("/preview?module=inventory");
  }, [moduleId, router, view]);
  return (
    <AppShell preview previewModule={moduleId} previewView={view}>
      {moduleId === "dashboard" ? (
        <Dashboard preview />
      ) : (
        <ModulePage
          key={moduleId + (view ?? "")}
          module={moduleId}
          subpage={moduleId === "inventory" ? undefined : view}
          preview
        />
      )}
    </AppShell>
  );
}
