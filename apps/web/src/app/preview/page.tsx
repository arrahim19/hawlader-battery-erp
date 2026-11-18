import { Suspense } from "react";
import { PreviewContent } from "@/components/preview-content";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <AppShell preview>
          <Dashboard preview />
        </AppShell>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
