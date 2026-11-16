import type {
  CurrentUser,
  DashboardData,
  SupplierList,
  SupplierRecord,
} from "../../../../packages/api-client/src";
export type { CurrentUser, DashboardData, SupplierList, SupplierRecord };
export type {
  CustomerSalesHistory,
  ReplacementStage,
  ReplacementCase,
  ReplacementList,
  ReplacementOptions,
  CatalogMetadata,
  CatalogProduct,
  ProductList,
  ProductTypeRecord,
  ProductTrackingKind,
  PurchaseOptions,
  PurchaseList,
  RecentPurchases,
  ReceivedPurchase,
  CustomerRecord,
  CustomerList,
  SalesOptions,
  CompletedSale,
  SalesList,
  ExpenseRecord,
  ExpenseList,
  ExpenseOptions,
} from "../../../../packages/api-client/src";
export const SESSION_EXPIRED_EVENT = "hawlader:session-expired";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/v1" + route, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (
    response.status === 401 &&
    route !== "/auth/login" &&
    typeof window !== "undefined"
  )
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error?.message ?? "The server could not complete this request.",
    );
  return result.data as T;
}
export async function csrf() {
  return (await api<{ token: string }>("/auth/csrf")).token;
}
export async function post<T>(
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return api<T>(route, {
    method: "POST",
    headers: { ...headers, "X-CSRF-Token": await csrf() },
    body: JSON.stringify(body),
  });
}
