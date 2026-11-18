"use client";
import { useSyncExternalStore } from "react";
const emptyDate = () => "";
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function subscribe(listener: () => void) {
  const interval = window.setInterval(listener, 60_000);
  window.addEventListener("focus", listener);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("focus", listener);
  };
}
// Dates are runtime values, so no build-time date is frozen into static HTML.
export function useBusinessDate() {
  return useSyncExternalStore(subscribe, today, emptyDate);
}
