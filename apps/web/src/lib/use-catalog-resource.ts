"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useWorkspaceResources } from "@/components/workspace-resources";
import { useSession } from "@/components/session-provider";

const noSubscribe = () => () => {};
const zero = () => 0;

export function useCatalogResource<T>(
  requestedPath: string | null,
  revision: number,
  keepPreviousData = false,
) {
  const user = useSession();
  const requested = Boolean(requestedPath);
  // Static HTML contains layout only; authenticated reads begin after /auth/me.
  const path = user ? requestedPath : null;
  const resources = useWorkspaceResources();
  const generation = useSyncExternalStore(
    resources?.subscribe ?? noSubscribe,
    resources?.snapshot ?? zero,
    zero,
  );
  const key = JSON.stringify([path, revision, generation]);
  const [result, setResult] = useState<{
    key: string;
    path: string;
    data: T;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  useEffect(() => {
    if (!path) return;
    let active = true;
    (resources ? resources.load<T>(path) : api<T>(path))
      .then((data) => {
        if (active) setResult({ key, path, data });
      })
      .catch((error: unknown) => {
        if (active)
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : "Unable to load the catalog.",
          });
      });
    return () => {
      active = false;
    };
  }, [path, key, resources]);
  const data =
    result && (result.key === key || (keepPreviousData && result.path === path))
      ? result.data
      : path
        ? ((resources?.data.get(path) as T | undefined) ?? null)
        : null;
  const error = failure?.key === key ? failure.message : "";
  return { data, error, loading: requested && !data && !error };
}
