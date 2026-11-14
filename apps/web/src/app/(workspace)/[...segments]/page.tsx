import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { WorkspaceQuery } from "@/components/workspace-query";
import { modules } from "@/lib/modules";
import { childNavigation } from "@/lib/workspace-navigation";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(modules).flatMap((moduleId) => [
    { segments: [moduleId] },
    ...(childNavigation[moduleId] ?? []).map(({ view }) => ({
      segments: [moduleId, view],
    })),
    ...(["products", "inventory"].includes(moduleId)
      ? [{ segments: [moduleId, "new"] }, { segments: [moduleId, "list"] }]
      : []),
  ]);
}
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  const moduleId = segments[0];
  if (moduleId === "products") redirect("/inventory");
  if (moduleId === "inventory" && segments[1]) redirect("/inventory");
  if (!Object.hasOwn(modules, moduleId)) notFound();
  return (
    <Suspense fallback={<p role="status">Loading workspace...</p>}>
      <WorkspaceQuery
        moduleId={moduleId}
        subpage={segments.slice(1).join("/")}
      />
    </Suspense>
  );
}
