"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BatteryCharging, RefreshCw } from "lucide-react";
import {
  api,
  ApiError,
  SESSION_EXPIRED_EVENT,
  type CurrentUser,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SessionContext = createContext<CurrentUser | null>(null);
export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    function expireSession() {
      setUser(null);
      setError("");
      router.replace("/login");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    api<CurrentUser>("/auth/me", { signal: controller.signal })
      .then(setUser)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) return;
        setError(error instanceof Error ? error.message : "Unable to connect.");
      });
    return () => {
      controller.abort();
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
    };
  }, [router, retry]);
  if (error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8">
          <AlertCircle className="mb-4 size-8 text-amber-500" />
          <h1 className="text-xl font-semibold">Workspace unavailable</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">{error}</p>
          <p className="mt-3 text-xs text-slate-400">
            Start the API and database, then apply migrations. Setup
            instructions are in docs/DEVELOPMENT.md.
          </p>
          <Button
            className="mt-6"
            onClick={() => {
              setError("");
              setRetry((value) => value + 1);
            }}
          >
            <RefreshCw />
            Retry connection
          </Button>
        </div>
      </main>
    );
  if (!user)
    return (
      <main
        aria-busy="true"
        aria-label="Loading workspace"
        className="min-h-screen bg-slate-50 p-8"
      >
        <BatteryCharging className="mb-8 size-9 text-emerald-600" />
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="mb-8 h-4 w-80 max-w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-32" />
          ))}
        </div>
        <Skeleton className="mt-6 h-72" />
      </main>
    );
  return (
    <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
  );
}
