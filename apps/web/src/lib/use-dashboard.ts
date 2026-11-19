"use client";
import { randomId } from "@/lib/random-id";
import { useEffect, useState } from "react";
import { api, type DashboardData } from "@/lib/api";
import { useSession } from "@/components/session-provider";
const dashboardUpdateKey = "hawlader:dashboard-update";
export function notifyDashboardUpdate() {
  window.dispatchEvent(new Event(dashboardUpdateKey));
  try {
    localStorage.setItem(dashboardUpdateKey, randomId());
  } catch {
    // Same-tab refresh remains available when storage is disabled.
  }
}
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
  const user = useSession();
  const canLoad = enabled && Boolean(user) && Boolean(from && to);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: DashboardData;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const rangeKey = [from, to].join(":");
  const key = [rangeKey, revision].join(":");
  useEffect(() => {
    if (preview || !canLoad) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible")
        setRevision((value) => value + 1);
    };
    window.addEventListener("focus", refreshWhenVisible);
    const refreshAfterWrite = (event: StorageEvent) => {
      if (event.key === dashboardUpdateKey) refreshWhenVisible();
    };
    window.addEventListener(dashboardUpdateKey, refreshWhenVisible);
    window.addEventListener("storage", refreshAfterWrite);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener(dashboardUpdateKey, refreshWhenVisible);
      window.removeEventListener("storage", refreshAfterWrite);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [preview, canLoad]);
  useEffect(() => {
    if (preview || !canLoad) return;
    const controller = new AbortController();
    api<DashboardData>(`/dashboard?from=${from}&to=${to}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult({ key: rangeKey, data });
        setFailure(null);
      })
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
  }, [key, rangeKey, from, to, preview, canLoad]);
  return {
    // Keep the current range visible while polling or refreshing in the background.
    data: result?.key === rangeKey ? result.data : null,
    error: failure?.key === key ? failure.message : "",
    loading:
      !preview && enabled && result?.key !== rangeKey && failure?.key !== key,
    refresh: () => setRevision((value) => value + 1),
  };
}
