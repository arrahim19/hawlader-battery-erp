import { test, expect } from "@playwright/test";

for (const empty of [false, true]) {
  test(
    "expense ring remains static without percentages with " +
      (empty ? "zero expenses" : "category percentages"),
    async ({ page }, info) => {
      await page.route("**/api/v1/**", async (route) => {
        const path = new URL(route.request().url()).pathname.replace(
          "/api/v1",
          "",
        );
        const data = (value: unknown) =>
          route.fulfill({ json: { data: value } });
        if (path === "/auth/me")
          return data({
            id: "owner",
            name: "Owner",
            login: "owner",
            roles: ["OWNER"],
            permissions: ["finance.read"],
          });
        if (path.startsWith("/modules/")) return data({});
        if (path === "/dashboard")
          return data({ financials: {}, recentSales: [] });
        if (path === "/expenses")
          return data({
            items: [],
            total: 0,
            page: 1,
            pageSize: 3,
            summary: {
              total: empty ? "0.00" : "7000.00",
              byCategory: empty
                ? []
                : [
                    { name: "Office Expense", amount: "5500.00" },
                    { name: "Transport", amount: "1500.00" },
                  ],
            },
          });
        return route.abort();
      });
      await page.goto("/accounts");
      if (info.project.name === "mobile") {
        const tabs = page.getByRole("navigation", { name: "Accounts panels" });
        await expect(tabs.getByRole("button")).toHaveText([
          "Expenses",
          "Transactions",
          "Expense Summary",
        ]);
        await tabs
          .getByRole("button", { name: "Expense Summary", exact: true })
          .click();
      }
      const ring = page.locator(".expense-donut");
      await expect(ring).toBeVisible();
      await expect(page.locator(".donut-legend")).not.toContainText("%");
      await expect(ring.getByRole("button")).toHaveCount(0);
      await expect(ring.locator("strong")).toContainText(
        empty ? "0.00" : "7,000.00",
      );
      const initial = await ring.textContent();
      const box = await ring.locator("svg").boundingBox();
      if (!box) throw Error("Missing ring");
      for (const fraction of [0.3, 0.9]) {
        const angle = fraction * Math.PI * 2 - Math.PI / 2;
        const x = box.x + box.width / 2 + box.width * 0.45 * Math.cos(angle);
        const y = box.y + box.height / 2 + box.height * 0.45 * Math.sin(angle);
        if (info.project.name === "mobile") await page.touchscreen.tap(x, y);
        else {
          await page.mouse.move(x, y);
          await page.mouse.click(x, y);
        }
        await expect(ring).toHaveText(initial!);
        await expect(ring).not.toContainText("%");
      }
    },
  );
}
