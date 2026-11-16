import { test, expect, type Route } from "@playwright/test";

for (const module of [
  "purchases",
  "inventory",
  "sales",
  "replacements",
  "customers",
  "suppliers",
  "accounts",
  "recycle-bin",
  "users",
  "settings",
]) {
  test(`${module} keeps its layout and icons while data loads`, async ({
    page,
  }) => {
    let moduleRequest: Route | undefined;
    await page.route("**/api/v1/**", async (route) => {
      const endpoint = new URL(route.request().url()).pathname;
      if (endpoint.endsWith("/auth/me"))
        return route.fulfill({
          json: {
            data: {
              id: "static-layout-owner",
              name: "Owner",
              login: "owner",
              roles: ["OWNER"],
              permissions: [
                "dashboard.read",
                "finance.read",
                "purchases.manage",
                "sales.manage",
                "inventory.read",
                "customers.read",
                "suppliers.read",
                "replacements.intake.customer",
              ],
            },
          },
        });
      if (endpoint === `/api/v1/modules/${module}`) moduleRequest = route;
      // Hold all data requests to inspect the actual initial loading state.
    });
    await page.goto(`/${module}`);
    await expect.poll(() => Boolean(moduleRequest)).toBe(true);
    const main = page.getByRole("main");
    const icon = main.locator("svg").first();
    await expect(icon).toBeVisible();
    await expect(main.locator(".animate-pulse")).toHaveCount(0);
    const original = await icon.elementHandle();
    if (!original) throw new Error("Missing static icon");
    const cards = main.locator(".erp-stat");
    if (["accounts", "suppliers", "replacements"].includes(module)) {
      await expect(cards.first()).toBeVisible();
      await expect(cards.first().locator(".erp-stat-value")).toHaveText("—");
    }
    await moduleRequest!.fulfill({
      json: { data: { status: "FOUNDATION_ONLY" } },
    });
    await expect(icon).toBeVisible();
    expect(await original.evaluate((element) => element.isConnected)).toBe(
      true,
    );
    await expect(main.locator(".animate-pulse")).toHaveCount(0);
  });
}
