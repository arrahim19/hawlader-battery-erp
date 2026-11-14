import { Suspense } from "react";
import { PreviewContent } from "@/components/preview-content";

export default function PreviewPage() {
  return (
    <Suspense fallback={<p role="status">Loading preview...</p>}>
      <PreviewContent />
    </Suspense>
  );
}
