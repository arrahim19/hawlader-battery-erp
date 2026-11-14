"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="m-8 rounded-xl border border-red-100 bg-white p-8"
    >
      <h1 className="text-xl font-semibold">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-slate-500">
        Your records have not been changed. Try again or return to the
        dashboard.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
