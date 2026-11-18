"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  RESOURCE_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
  type CurrentUser,
} from "@/lib/api";

const metadataPath = "/catalog?status=active";

class WorkspaceResources {
  readonly data = new Map<string, unknown>();
  private pending = new Map<string, Promise<unknown>>();
  private listeners = new Set<() => void>();
  private generation = 0;
  constructor(private storageKey: string | null) {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (
        saved &&
        Date.now() - saved.savedAt < 15 * 60_000 &&
        Array.isArray(saved.data?.types) &&
        Array.isArray(saved.data?.categories)
      ) {
        this.data.set(metadataPath, saved.data);
      }
    } catch {
      // Storage is optional; API revalidation always runs.
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.generation;
  refresh = () => {
    this.generation++;
    this.pending.clear();
    this.listeners.forEach((listener) => listener());
  };
  invalidate = () => {
    this.data.clear();
    try {
      if (this.storageKey) sessionStorage.removeItem(this.storageKey);
    } catch {}
    this.refresh();
  };
  load<T>(path: string): Promise<T> {
    const pending = this.pending.get(path);
    if (pending) return pending as Promise<T>;
    const generation = this.generation;
    const request = api<T>(path)
      .then((data) => {
        if (generation === this.generation) {
          // Bound memory when users browse many searches and pages.
          if (this.data.size >= 100)
            this.data.delete(this.data.keys().next().value!);
          this.data.set(path, data);
          if (path === metadataPath && this.storageKey) {
            try {
              sessionStorage.setItem(
                this.storageKey,
                JSON.stringify({ savedAt: Date.now(), data }),
              );
            } catch {}
          }
        }
        return data;
      })
      .finally(() => {
        if (this.pending.get(path) === request) this.pending.delete(path);
      });
    this.pending.set(path, request);
    return request;
  }
}

const ResourceContext = createContext<WorkspaceResources | null>(null);
export const useWorkspaceResources = () => useContext(ResourceContext);

export function WorkspaceResourcesProvider({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: ReactNode;
}) {
  // Owned by the authenticated workspace; never shared with another login or SSR request.
  const [resources] = useState(
    () => new WorkspaceResources(user ? `hawlader:catalog:${user.id}` : null),
  );
  useEffect(() => {
    if (!user) return;
    if (user.permissions.includes("inventory.read")) {
      void resources.load("/catalog?status=active").catch(() => {});
      void resources
        .load("/products?status=active&page=1&pageSize=10")
        .catch(() => {});
    }
    window.addEventListener(RESOURCE_CHANGED_EVENT, resources.invalidate);
    window.addEventListener(SESSION_EXPIRED_EVENT, resources.invalidate);
    window.addEventListener("focus", resources.refresh);
    const onStorage = (event: StorageEvent) => {
      if (event.key === RESOURCE_CHANGED_EVENT) resources.invalidate();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(RESOURCE_CHANGED_EVENT, resources.invalidate);
      window.removeEventListener(SESSION_EXPIRED_EVENT, resources.invalidate);
      window.removeEventListener("focus", resources.refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [resources, user]);
  return (
    <ResourceContext.Provider value={resources}>
      {children}
    </ResourceContext.Provider>
  );
}
