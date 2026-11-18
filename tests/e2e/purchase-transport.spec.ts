import { test, expect } from "@playwright/test";

test("accounts shows saved purchase transport in expenses and transactions", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          data: {
            id: "transport-owner",
            name: "Owner",
            login: "owner",
            roles: ["OWNER"],
            permissions: ["dashboard.read", "finance.read"],
          },
        },
      });
    if (path.includes("/modules/"))
      return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
    if (path.endsWith("/expenses"))
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                id: "transport-line",
                expenseId: null,
                date: "2026-11-16",
                description: "Purchase receipt PUR-TRANSPORT",
                category: "Transport",
                amount: "250.50",
                paymentAccount: "Cash",
                source: "PURCHASE_TRANSPORT",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 5,
            summary: {
              total: "250.50",
              byCategory: [{ name: "Transport", amount: "250.50" }],
            },
          },
        },
      });
    if (path.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          data: {
            businessDate: "2026-11-16",
            from: "2026-11-16",
            to: "2026-11-16",
            counts: {
              products: 0,
              customers: 0,
              availableStock: "0",
              pendingReplacements: 0,
              sentToCompany: 0,
              replacementsReceived: 0,
              lowStock: 0,
            },
            financials: {
              todaySales: "0",
              grossProfit: "0",
              transportExpenses: "250.50",
              transportTransactions: [
                {
                  id: "transport-line",
                  date: "2026-11-16",
                  description: "Purchase receipt PUR-TRANSPORT",
                  amount: "250.50",
                },
              ],
            },
            recentSales: [],
            lowStock: [],
            salesTrend: [],
          },
        },
      });
    return route.abort();
  });
  await page.goto("/accounts");
  const expense = page
    .locator(".erp-stat")
    .filter({ hasText: "Total Expenses" });
  await expect(expense.locator(".erp-stat-value")).toContainText("250.50");
  const row = page
    .getByRole("table", { name: "Expenses", exact: true })
    .getByRole("row")
    .filter({ hasText: "PUR-TRANSPORT" });
  await expect(row).toContainText("Transport");
  await expect(row).toContainText("250.50");
  await expect(row).toContainText("2026-11-16");
});
