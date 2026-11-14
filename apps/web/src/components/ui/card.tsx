import * as React from "react";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "rounded-xl border border-slate-200/90 bg-white shadow-xs",
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-start justify-between gap-3 p-5", className)}
      {...props}
    />
  );
}
export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="card-title"
      className={cn("text-sm font-semibold text-slate-900", className)}
      {...props}
    />
  );
}
export function CardContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 pb-5", className)}
      {...props}
    />
  );
}
