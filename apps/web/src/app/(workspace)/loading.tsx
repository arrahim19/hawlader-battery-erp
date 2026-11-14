"use client";
import { usePathname } from "next/navigation";
import { PurchasesView } from "@/components/workspace/purchases-view";
import { SalesView } from "@/components/workspace/sales-view";
import Loading from "../loading";

export default function WorkspaceLoading() {
  const pathname = usePathname();
  if (pathname.split("/")[1] === "purchases")
    return (
      <PurchasesView preview={false} loading view={pathname.split("/")[2]} />
    );
  if (pathname.split("/")[1] === "sales")
    return <SalesView loading view={pathname.split("/")[2]} />;
  return <Loading />;
}
