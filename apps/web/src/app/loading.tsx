import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading page" className="space-y-4 p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-72" />
    </div>
  );
}
