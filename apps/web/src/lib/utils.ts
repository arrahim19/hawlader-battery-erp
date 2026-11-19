import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function money(value?: string | null) {
  if (value == null) return "—";
  // Presentation only; backend Decimal arithmetic remains authoritative.
  return (
    "৳" +
    new Intl.NumberFormat("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value))
  );
}
export function businessDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value.includes("T") ? value : value + "T12:00:00+06:00"));
}
export function shortBusinessDate(value?: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1].slice(-2)}` : value;
}
