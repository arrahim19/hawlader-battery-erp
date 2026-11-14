import type { ReactNode } from "react";
export function PageHeader({
  eyebrow = "WORKSPACE",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-[10px] font-bold tracking-[.16em] text-slate-400">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          {description}
        </p>
      </div>
      {actions}
    </div>
  );
}
