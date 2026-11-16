import { test, expect, type Page } from "@playwright/test";

async function expectViewportFit(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const main = document.querySelector(".main-content")!;
        return (
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth &&
          main.scrollHeight <= main.clientHeight + 1
        );
      }),
    )
    .toBe(true);
  for (const selector of [
    ".accounts-workspace",
    ".accounts-chart-grid",
    ".accounts-bottom",
    ".accounts-quick-actions",
    ".expenses-body .erp-table-wrap",
  ]) {
    const element = page.locator(selector);
    if (await element.isVisible())
      await expect
        .poll(() =>
          element.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        )
        .toBe(true);
  }
}

test("accounts fits short viewports with populated tables, pagination and accessible actions", async ({
  page,
}, info) => {
  const records = Array.from({ length: 25 }, (_, index) => ({
    id: `expense-${index}`,
    expenseId: `expense-${index}`,
    date: "2026-11-16",
    description: `Expense ${index} ` + "long description ".repeat(20),
    challanNumber: `CH-${index}`,
    category: "Office Expense",
    amount: "12.50",
    paymentAccount: "Cash",
    source: "MANUAL",
  }));
  const writes: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/v1", "");
    if (request.method() !== "GET") {
      writes.push(path);
      return route.abort();
    }
    if (path === "/auth/me")
      return route.fulfill({
        json: {
          data: {
            id: "owner",
            name: "Owner",
            login: "owner",
            roles: ["OWNER"],
            permissions: ["finance.read", "finance.write", "dashboard.read"],
          },
        },
      });
    if (path.startsWith("/modules/"))
      return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
    if (path === "/dashboard")
      return route.fulfill({
        json: {
          data: {
            counts: {},
            financials: {
              todaySales: "-66200",
              salesIncome: "105000",
              salesProfit: "25000",
              grossProfit: "-8700",
              companyTransactions: Array.from({ length: 7 }, (_, index) => ({
                id: `payment-${index}`,
                date: "2026-11-16",
                company: `Company ${index}`,
                challanNumber: `CH-${index}`,
                type: "Payment",
                amount: "25.00",
              })),
              transportTransactions: Array.from({ length: 7 }, (_, index) => ({
                id: `transport-${index}`,
                date: "2026-11-16",
                description: `Transport transaction ${index}`,
                amount: "25.00",
              })),
            },
          },
        },
      });
    if (path === "/expenses/options")
      return route.fulfill({
        json: {
          data: {
            categories: ["Office Expense", "Transport", "Others"],
            cashAvailable: true,
            paymentAccounts: [],
          },
        },
      });
    if (path === "/expenses") {
      const page = Number(url.searchParams.get("page")),
        pageSize = Number(url.searchParams.get("pageSize"));
      return route.fulfill({
        json: {
          data: {
            items: records.slice((page - 1) * pageSize, page * pageSize),
            total: records.length,
            page,
            pageSize,
            summary: {
              total: "312.50",
              byCategory: [{ name: "Office Expense", amount: "312.50" }],
            },
          },
        },
      });
    }
    return route.abort();
  });
  const sizes =
    info.project.name === "mobile"
      ? [
          [390, 650],
          [360, 640],
        ]
      : [
          [1366, 650],
          [1024, 600],
        ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto("/accounts");
    const table = page.getByRole("table", { name: "Expenses", exact: true });
    await expect(table.locator("tbody tr").first()).toContainText("CH-0");
    await expect(page.locator(".accounts-stats")).toContainText("105,000.00");
    await expect(page.locator(".accounts-stats")).toContainText("25,000.00");
    await expect(page.locator(".accounts-stats")).not.toContainText("-66,200");
    await expectViewportFit(page);
    const descriptions = new Set<string>();
    const next = page.getByRole("button", {
      name: "Next expenses page",
      exact: true,
    });
    for (let index = 0; index < 30; index++) {
      for (const text of await table
        .locator("tbody tr td:nth-child(3)")
        .allTextContents())
        descriptions.add(text);
      await expectViewportFit(page);
      if (await next.isDisabled()) break;
      const previous = await table
        .locator("tbody tr td:nth-child(3)")
        .first()
        .textContent();
      await next.click();
      await expect(
        table.locator("tbody tr td:nth-child(3)").first(),
      ).not.toHaveText(previous!);
    }
    expect(descriptions.size).toBe(25);
    const panels = page.getByRole("navigation", { name: "Accounts panels" });
    if (await panels.isVisible()) {
      await panels
        .getByRole("button", { name: "Categories", exact: true })
        .click();
      await expect(page.locator(".donut-legend")).toBeVisible();
      await expectViewportFit(page);
      await panels
        .getByRole("button", { name: "Transactions", exact: true })
        .click();
    }
    const transactions = page.locator(".accounts-transactions-panel");
    await expect(transactions.locator("tbody tr")).toHaveCount(2);
    await expectViewportFit(page);
    await page
      .getByRole("button", { name: "Next transactions page", exact: true })
      .click();
    await expect(transactions.locator("tbody tr").first()).toContainText(
      "Company 2",
    );
    if (await panels.isVisible())
      await panels
        .getByRole("button", { name: "Expenses", exact: true })
        .click();
    await expectViewportFit(page);
    await page
      .getByRole("button", { name: "Add Expense", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Add Expense",
      exact: true,
    });
    await expect(dialog).toBeInViewport();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expectViewportFit(page);
  }
  expect(writes).toEqual([]);
});
