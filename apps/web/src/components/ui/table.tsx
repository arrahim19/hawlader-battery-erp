import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full text-left text-sm", className)}
        {...props}
      />
    </div>
  );
}
export function TableHeader(props: ComponentProps<"thead">) {
  return (
    <thead
      className="border-y border-slate-100 bg-slate-50/70 text-[10px] tracking-wider text-slate-500 uppercase"
      {...props}
    />
  );
}
export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("h-10 px-5 font-semibold whitespace-nowrap", className)}
      {...props}
    />
  );
}
export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-slate-100" {...props} />;
}
export function TableRow(props: ComponentProps<"tr">) {
  return <tr className="hover:bg-slate-50/50" {...props} />;
}
export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-5 py-4", className)} {...props} />;
}
