import { test, expect } from "@playwright/test";
import type { SupplierLedgerRecord } from "../../packages/api-client/src";

test("supplier ledger loads balances, filters suppliers, and opens real statement data", async ({
  page,
}) => {
  const types = [
    { id: "27a58292-67fe-4909-8d1e-9bfb377d6201", name: "Battery" },
    { id: "27a58292-67fe-4909-8d1e-9bfb377d6202", name: "Parts" },
  ];
  const suppliers: SupplierLedgerRecord[] = [
    {
      id: "supplier-one",
      name: "Ikram",
      company: "Ikram Motors",
      phone: "01958645434",
      active: true,
      createdAt: "2026-11-19",
      productTypeId: types[1].id,
      productType: types[1],
      totalPurchases: "230000.00",
      due: "30000.00",
    },
    {
      id: "supplier-two",
      name: "Mijan",
      company: "Saif Power",
      phone: "01744545555",
      active: true,
      createdAt: "2026-11-19",
      productTypeId: types[0].id,
      productType: types[0],
      totalPurchases: "400000.00",
      due: "0.00",
    },
  ];
  let failList = true;
  const unhandled: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === "/auth/me")
      return data({
        id: "owner",
        name: "Owner",
        login: "owner",
        roles: ["OWNER"],
        permissions: ["parties.suppliers", "finance.read"],
      });
    if (path.startsWith("/modules/"))
      return data({ status: "FOUNDATION_ONLY" });
    if (path === "/dashboard")
      return data({
        businessDate: "2026-11-19",
        from: "2026-11-19",
        to: "2026-11-19",
        counts: {
          products: 0,
          customers: 0,
          availableStock: "0",
          pendingReplacements: 0,
          sentToCompany: 0,
          replacementsReceived: 0,
          lowStock: 0,
        },
        recentSales: [],
        lowStock: [],
        salesTrend: [],
      });
    if (path === "/suppliers/product-types") return data(types);
    if (path === "/suppliers/ledger") {
      if (failList)
        return route.fulfill({
          status: 503,
          json: { error: { message: "Ledger temporarily unavailable" } },
        });
      const items = suppliers.filter((supplier) => {
        const query = url.searchParams.get("q") ?? "";
        const type = url.searchParams.get("productTypeId");
        return (
          (!type || supplier.productTypeId === type) &&
          supplier.name.toLowerCase().includes(query.toLowerCase())
        );
      });
      return data({
        items,
        total: items.length,
        page: 1,
        pageSize: Number(url.searchParams.get("pageSize")),
        summary: { totalDue: "30000.00", totalPurchases: "630000.00" },
      });
    }
    if (path === "/suppliers/supplier-one/ledger")
      return data({
        supplier: suppliers[0],
        items: [
          {
            id: "purchase",
            date: "2026-11-18T06:00:00Z",
            reference: "CH-100",
            description: "Purchase receipt",
            credit: "230000.00",
            debit: "0.00",
            balance: "230000.00",
          },
          {
            id: "payment",
            date: "2026-11-18T06:01:00Z",
            reference: "PAY-100",
            description: "Purchase payment",
            credit: "0.00",
            debit: "200000.00",
            balance: "30000.00",
          },
        ],
      });
    unhandled.push(path);
    return route.abort();
  });
  await page.goto("/suppliers/ledger");
  await expect(
    page.locator(".supplier-ledger").getByRole("alert"),
  ).toContainText("Ledger temporarily unavailable");
  failList = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const table = page.getByRole("table", {
    name: "Supplier ledger balances",
    exact: true,
  });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table.getByRole("columnheader")).toHaveCount(6);
  await expect(
    table.getByRole("row").filter({ hasText: "Ikram Motors" }),
  ).toContainText("230,000.00");
  await expect(
    table.getByRole("row").filter({ hasText: "Ikram Motors" }),
  ).toContainText("30,000.00");
  const details = page.locator(".erp-details");
  await expect(details).toContainText("Ikram");
  await expect(details).toContainText("01958645434");
  await page
    .getByRole("button", { name: "বিস্তারিত Mijan", exact: true })
    .click();
  await expect(details).toContainText("01744545555");
  const product = page.getByLabel("Filter suppliers by product", {
    exact: true,
  });
  await product.selectOption(types[1].id);
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("Ikram Motors");
  await product.selectOption("");
  await page.getByLabel("Search suppliers", { exact: true }).fill("Mijan");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("Saif Power");
  await page.getByLabel("Search suppliers", { exact: true }).fill("");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "বিস্তারিত Ikram", exact: true })
    .click();
  await page.getByRole("button", { name: "লেজার দেখুন", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ledger", exact: true });
  await expect(
    dialog
      .getByRole("table", { name: "Supplier transactions" })
      .locator("tbody tr"),
  ).toHaveCount(2);
  await expect(dialog).toContainText("CH-100");
  await expect(dialog).toContainText("PAY-100");
  await expect(dialog).toContainText("200,000.00");
  await page.getByRole("button", { name: "Close ledger", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(unhandled).toEqual([]);
  expect(errors).toEqual([]);
});
