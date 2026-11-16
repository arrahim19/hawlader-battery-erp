import { test, expect, type Route } from "@playwright/test";
import type { DashboardData } from "../../packages/api-client/src";

const snapshot: DashboardData = {
  businessDate: "2026-11-16",
  from: "2026-11-16",
  to: "2026-11-16",
  counts: {
    products: 0,
    customers: 0,
    suppliers: 0,
    availableStock: "0",
    pendingReplacements: 0,
    sentToCompany: 0,
    replacementsReceived: 0,
    lowStock: 0,
  },
  financials: {
    todaySales: "100",
    grossProfit: "25",
    todayPurchases: "0",
    todayCashReceived: "100",
    availableStockPurchaseValue: "0",
    customerDues: "0",
    supplierDues: "0",
  },
  recentSales: [],
  lowStock: [],
  salesTrend: [],
};

for (const path of ["/dashboard", "/accounts"]) {
  test(`${path} updates values without replacing cards during background requests`, async ({
    page,
  }) => {
    await page.clock.install();
    let hold = true;
    let pending: Route | undefined;
    await page.route("**/api/v1/**", async (route) => {
      const endpoint = new URL(route.request().url()).pathname;
      if (endpoint.endsWith("/auth/me"))
        return route.fulfill({
          json: {
            data: {
              id: "live-update-owner",
              name: "Owner",
              login: "owner",
              roles: ["OWNER"],
              permissions: ["dashboard.read", "finance.read"],
            },
          },
        });
      if (endpoint.includes("/modules/"))
        return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
      if (endpoint.endsWith("/dashboard")) {
        if (hold) {
          pending = route;
          return;
        }
        return route.fulfill({ json: { data: snapshot } });
      }
      return route.abort();
    });
    await page.goto(path);
    const cards = page.locator(".erp-stats .erp-stat");
    const sales = cards.first().locator(".erp-stat-value");
    await expect.poll(() => Boolean(pending)).toBe(true);
    await expect(cards).toHaveCount(path === "/dashboard" ? 4 : 5);
    await expect(cards.first().locator(".erp-stat-icon svg")).toBeVisible();
    await expect(cards.first().locator(".erp-stat-label")).toBeVisible();
    await expect(sales).toHaveText("—");
    const initialCard = await cards.first().elementHandle();
    if (!initialCard) throw new Error("Missing card while loading");
    await pending!.fulfill({ json: { data: snapshot } });
    pending = undefined;
    await expect(sales).toHaveText("৳100.00");
    expect(await initialCard.evaluate((element) => element.isConnected)).toBe(
      true,
    );
    const original = await cards.first().elementHandle();
    if (!original) throw new Error("Missing initial card");
    hold = true;

    // Polling must leave the existing card and its value visible while delayed.
    await page.clock.fastForward(30_000);
    await expect.poll(() => Boolean(pending)).toBe(true);
    await expect(sales).toHaveText("৳100.00");
    expect(await original.evaluate((element) => element.isConnected)).toBe(
      true,
    );
    await expect(page.locator('.erp-stats[aria-busy="true"]')).toHaveCount(0);
    await pending!.fulfill({
      json: {
        data: {
          ...snapshot,
          financials: { ...snapshot.financials, todaySales: "250" },
        },
      },
    });
    pending = undefined;
    await expect(sales).toHaveText("৳250.00");
    expect(await original.evaluate((element) => element.isConnected)).toBe(
      true,
    );

    // A failed background request must keep the last successful values.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => Boolean(pending)).toBe(true);
    await pending!.fulfill({
      status: 503,
      json: { error: { message: "Temporarily unavailable" } },
    });
    pending = undefined;
    if (path === "/dashboard")
      await expect(
        page.locator('.dashboard-page [role="alert"]'),
      ).toContainText("Temporarily unavailable");
    await expect(sales).toHaveText("৳250.00");
    expect(await original.evaluate((element) => element.isConnected)).toBe(
      true,
    );

    // A local write notification updates values in place and clears the error.
    await page.evaluate(() =>
      window.dispatchEvent(new Event("hawlader:dashboard-update")),
    );
    await expect.poll(() => Boolean(pending)).toBe(true);
    await expect(sales).toHaveText("৳250.00");
    await pending!.fulfill({
      json: {
        data: {
          ...snapshot,
          financials: { ...snapshot.financials, todaySales: "400" },
        },
      },
    });
    pending = undefined;
    await expect(sales).toHaveText("৳400.00");
    await expect(
      page.getByText("Temporarily unavailable", { exact: true }),
    ).toHaveCount(0);
    expect(await original.evaluate((element) => element.isConnected)).toBe(
      true,
    );
  });
}
