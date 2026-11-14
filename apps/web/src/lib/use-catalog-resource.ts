"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useCatalogResource<T>(path: string | null, revision: number) {
  const key = JSON.stringify([path, revision]);
  const [result, setResult] = useState<{ key: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : "Unable to load the catalog.",
          });
      });
    return () => controller.abort();
  }, [path, key]);
  const data = result?.key === key ? result.data : null;
  const error = failure?.key === key ? failure.message : "";
  return { data, error, loading: Boolean(path) && !data && !error };
}
