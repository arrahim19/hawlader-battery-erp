import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
export function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-5 text-center",
        compact ? "py-7" : "py-12",
      )}
    >
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400">
        <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1.5 max-w-72 text-xs leading-relaxed text-slate-400">
        {description}
      </p>
    </div>
  );
}
