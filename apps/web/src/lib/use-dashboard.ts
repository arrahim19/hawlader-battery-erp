"use client";
import { useEffect, useState } from "react";
import { api, type DashboardData } from "@/lib/api";
export function todayInDhaka() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function useDashboardData({
  preview = false,
  enabled = true,
  from = todayInDhaka(),
  to = todayInDhaka(),
}: { preview?: boolean; enabled?: boolean; from?: string; to?: string } = {}) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: DashboardData;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const key = [from, to, revision].join(":");
  useEffect(() => {
    if (preview || !enabled) return;
    const controller = new AbortController();
    api<DashboardData>(`/dashboard?from=${from}&to=${to}`, {
      signal: controller.signal,
    })
      .then((data) => setResult({ key, data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : "পরিসংখ্যান লোড করা যায়নি।",
          });
      });
    return () => controller.abort();
  }, [key, from, to, preview, enabled]);
  return {
    data: result?.key === key ? result.data : null,
    error: failure?.key === key ? failure.message : "",
    loading: !preview && enabled && result?.key !== key && failure?.key !== key,
    refresh: () => setRevision((value) => value + 1),
  };
}
