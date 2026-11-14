import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-3 focus-visible:ring-emerald-100 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
