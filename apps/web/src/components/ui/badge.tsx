import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] leading-none font-semibold",
  {
    variants: {
      variant: {
        default: "bg-emerald-50 text-emerald-700",
        secondary: "bg-slate-100 text-slate-600",
        warning: "bg-amber-50 text-amber-700",
        destructive: "bg-red-50 text-red-700",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof variants>) {
  return (
    <span
      data-slot="badge"
      className={cn(variants({ variant }), className)}
      {...props}
    />
  );
}
