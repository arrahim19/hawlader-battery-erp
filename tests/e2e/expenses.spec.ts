import { test, expect } from "@playwright/test";
import type { ExpenseRecord } from "../../packages/api-client/src";

test("expenses replace the chart, save safely with cash, and keep all three fields on one row", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 850,
  });
  const records: ExpenseRecord[] = [
    {
      id: "transport",
      expenseId: null,
      date: "2026-11-16",
      description: "Purchase transport",
      challanNumber: "CH-001",
      category: "Transport",
      amount: "250.50",
      paymentAccount: "Cash",
      source: "PURCHASE_TRANSPORT",
    },
  ];
  const submissions: { body: object; key: string }[] = [];
  const errors: string[] = [];
  let releaseSave: (() => void) | undefined;
  let releaseList: (() => void) | undefined;
  let holdList = false;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/auth/me")
      return route.fulfill({
        json: {
          data: {
            id: "owner",
            login: "owner",
            name: "Owner",
            roles: ["OWNER"],
            permissions: ["finance.read", "finance.write", "dashboard.read"],
          },
        },
      });
    if (path.startsWith("/modules/"))
      return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
    if (path === "/auth/csrf")
      return route.fulfill({ json: { data: { token: "expense-csrf" } } });
    if (path === "/dashboard")
      return route.fulfill({
        json: {
          data: {
            counts: {},
            financials: { todaySales: "100", grossProfit: "25" },
          },
        },
      });
    if (path === "/expenses/options")
      return route.fulfill({
        json: {
          data: {
            categories: ["Office Expense", "Transport", "Others"],
            cashAvailable: true,
            paymentAccounts: [
              { id: "cash", name: "Cash", paymentMethod: "CASH" },
            ],
          },
        },
      });
    if (path === "/expenses" && request.method() === "POST") {
      expect(request.headers()["x-csrf-token"]).toBe("expense-csrf");
      const body = request.postDataJSON();
      submissions.push({ body, key: request.headers()["idempotency-key"] });
      if (submissions.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: { message: "Temporarily unavailable" } },
        });
      await new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      records.unshift({
        id: "manual",
        expenseId: "expense",
        date: body.expenseDate,
        description: body.description,
        amount: body.amount,
        category: body.category,
        paymentAccount: "Cash",
        source: "MANUAL",
      });
      holdList = true;
      return route.fulfill({ status: 201, json: { data: { id: "expense" } } });
    }
    if (path === "/expenses") {
      if (holdList)
        await new Promise<void>((resolve) => {
          releaseList = resolve;
        });
      return route.fulfill({
        json: {
          data: {
            items: records,
            total: records.length,
            page: 1,
            pageSize: 5,
            summary: {
              total: records.length === 1 ? "250.50" : "325.75",
              byCategory: records.map((record) => ({
                name: record.category,
                amount: record.amount,
              })),
            },
          },
        },
      });
    }
    errors.push("Unhandled " + request.method() + " " + path);
    return route.abort();
  });
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { name: "Income vs Expenses", exact: true }),
  ).toHaveCount(0);
  const table = page.getByRole("table", { name: "Expenses", exact: true });
  await expect(table).toContainText("CH-001");
  await expect(
    table.getByRole("columnheader", { name: "Challan No.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".donut-legend")).not.toContainText("Utilities");
  await expect(page.locator(".donut-legend")).not.toContainText("Maintenance");
  const total = page
    .locator(".erp-stat")
    .filter({ hasText: "Total Expenses" })
    .locator(".erp-stat-value");
  await expect(total).toHaveText("৳250.50");
  await expect(
    page.getByRole("columnheader", { name: "Payment Account", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Expense", exact: true });
  await expect(
    dialog.getByLabel("Expense payment account", { exact: true }),
  ).toHaveCount(0);
  const positions = await Promise.all(
    ["Expense date", "Expense category", "Expense amount"].map((label) =>
      dialog
        .getByLabel(label, { exact: true })
        .evaluate((el) => el.getBoundingClientRect().top),
    ),
  );
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(2);
  await dialog.getByLabel("Expense date", { exact: true }).fill("2026-11-16");
  await dialog
    .getByLabel("Expense category", { exact: true })
    .selectOption("Office Expense");
  await dialog.getByLabel("Expense amount", { exact: true }).fill("0");
  const save = dialog.getByRole("button", {
    name: "Save Expense",
    exact: true,
  });
  await save.click();
  expect(submissions).toHaveLength(0);
  await dialog.getByLabel("Expense amount", { exact: true }).fill("75.25");
  await save.click();
  await expect(dialog.getByRole("alert")).toHaveText("Temporarily unavailable");
  await expect(
    dialog.getByLabel("Expense amount", { exact: true }),
  ).toHaveValue("75.25");
  await save.click();
  await expect.poll(() => Boolean(releaseSave)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close expense dialog", exact: true }),
  ).toBeDisabled();
  releaseSave!();
  await expect.poll(() => Boolean(releaseList)).toBe(true);
  await expect(total).toHaveText("৳250.50");
  releaseList!();
  holdList = false;
  await expect(dialog).toHaveCount(0);
  await expect(table).toContainText("Office Expense");
  await expect(total).toHaveText("৳325.75");
  expect(submissions[0].key).toBe(submissions[1].key);
  expect(submissions[1].body).toEqual({
    expenseDate: "2026-11-16",
    category: "Office Expense",
    description: "",
    amount: "75.25",
  });
  await page.reload();
  await expect(table).toContainText("Office Expense");
  await expect(total).toHaveText("৳325.75");
  expect(errors).toEqual([]);
});

test("finance readers can view expenses without adding them", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          data: {
            id: "reader",
            login: "reader",
            name: "Reader",
            roles: [],
            permissions: ["finance.read"],
          },
        },
      });
    if (path.endsWith("/expenses"))
      return route.fulfill({
        json: {
          data: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 5,
            summary: { total: "0.00", byCategory: [] },
          },
        },
      });
    return route.fulfill({ json: { data: { counts: {}, financials: {} } } });
  });
  await page.goto("/accounts");
  await expect(
    page.getByRole("button", { name: "Add Expense", exact: true }),
  ).toBeDisabled();
});
