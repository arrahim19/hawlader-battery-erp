import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <p className="text-sm font-semibold text-emerald-600">404</p>
        <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This workspace page does not exist.
        </p>
        <Button asChild className="mt-5">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
