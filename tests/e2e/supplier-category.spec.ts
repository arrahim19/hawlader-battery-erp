import { test, expect } from "@playwright/test";

test("suppliers are created and assigned by category, and purchases show matching suppliers", async ({
  page,
}) => {
  const battery = {
    id: "27a58292-67fe-4909-8d1e-9bfb377d6201",
    name: "Battery",
    trackingKind: "BATTERY_UNIT",
  };
  const parts = {
    id: "27a58292-67fe-4909-8d1e-9bfb377d6202",
    name: "Parts",
    trackingKind: "QUANTITY",
  };
  const suppliers = [
    {
      id: "battery-supplier",
      name: "Battery Supplier",
      company: null,
      productTypeId: battery.id,
    },
    {
      id: "parts-supplier",
      name: "Parts Supplier",
      company: null,
      productTypeId: parts.id,
    },
    {
      id: "legacy-supplier",
      name: "Legacy Supplier",
      company: null,
      productTypeId: null,
    },
  ];
  let created: Record<string, string> | undefined;
  let updated: Record<string, string> | undefined;
  let assigned = false;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === "/auth/me")
      return data({
        id: "owner",
        name: "Owner",
        login: "owner",
        roles: ["OWNER"],
        permissions: [
          "parties.suppliers",
          "purchases.manage",
          "inventory.receive",
        ],
      });
    if (path === "/auth/csrf") return data({ token: "csrf" });
    if (path.startsWith("/modules/"))
      return data({ status: "FOUNDATION_ONLY" });
    if (path === "/suppliers/product-types") return data([battery, parts]);
    if (path === "/suppliers" && request.method() === "POST") {
      created = request.postDataJSON();
      return data({ id: "created-supplier", ...created });
    }
    if (path === "/suppliers/legacy-supplier/category") {
      updated = request.postDataJSON();
      assigned = true;
      return data({
        ...suppliers[2],
        productTypeId: parts.id,
        productType: parts,
      });
    }
    if (path === "/suppliers")
      return data({
        items: suppliers.map((supplier) => ({
          ...supplier,
          phone: "01712345678",
          address: null,
          active: true,
          createdAt: "2026-11-15",
          productTypeId:
            supplier.id === "legacy-supplier" && assigned
              ? parts.id
              : supplier.productTypeId,
          productType:
            supplier.id === "legacy-supplier"
              ? assigned
                ? parts
                : null
              : supplier.productTypeId === battery.id
                ? battery
                : parts,
        })),
        total: 3,
        page: 1,
        pageSize: 10,
        summary: { total: 3, active: 3 },
      });
    if (path === "/purchases/options")
      return data({
        suppliers,
        types: [battery, parts],
        products: [],
        productNames: [],
        paymentAccounts: [],
      });
    return route.abort();
  });

  await page.goto("/suppliers/new");
  await page
    .getByLabel("Supplier product category", { exact: true })
    .selectOption(battery.id);
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("New Battery Supplier");
  await page
    .getByLabel("Supplier mobile number", { exact: true })
    .fill("01712345678");
  await page
    .getByRole("button", { name: "Save Supplier", exact: true })
    .click();
  await expect(page).toHaveURL(/\/suppliers$/);
  expect(created).toMatchObject({
    name: "New Battery Supplier",
    productTypeId: battery.id,
  });

  await page
    .getByRole("button", { name: "Legacy Supplier", exact: true })
    .click();
  await page
    .getByLabel("Supplier product category", { exact: true })
    .selectOption(parts.id);
  await page
    .getByRole("button", { name: "Save Category", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Legacy Supplier" }),
  ).toContainText(parts.name);
  expect(updated).toEqual({ productTypeId: parts.id });

  await page.goto("/purchases/new");
  const category = page.getByLabel("Purchase product type", { exact: true });
  const supplier = page.getByLabel("Purchase supplier", { exact: true });
  await expect(supplier.locator("option")).toHaveCount(1);
  await category.selectOption(battery.id);
  await expect(supplier.locator("option")).toHaveCount(2);
  await expect(
    supplier.locator('option[value="battery-supplier"]'),
  ).toHaveCount(1);
  await expect(supplier.locator('option[value="parts-supplier"]')).toHaveCount(
    0,
  );
  await supplier.selectOption("battery-supplier");
  await category.selectOption(parts.id);
  await expect(supplier).toHaveValue("");
  await expect(
    supplier.locator('option[value="battery-supplier"]'),
  ).toHaveCount(0);
  await expect(supplier.locator('option[value="parts-supplier"]')).toHaveCount(
    1,
  );
  await expect(supplier.locator('option[value="legacy-supplier"]')).toHaveCount(
    0,
  );
});
