import { test, expect } from "@playwright/test";

test("supplier edits persist, cancellation makes no delete, and transaction errors remain visible", async ({
  page,
}) => {
  const category = {
    id: "27a58292-67fe-4909-8d1e-9bfb377d6201",
    name: "Battery",
  };
  let supplier = {
    id: "supplier-one",
    name: "Original Supplier",
    phone: "01712345678",
    company: "Original Company",
    active: true,
    productTypeId: category.id,
    productType: category,
    createdAt: "2026-11-15",
  };
  let removed = false;
  let deletes = 0;
  let rejectDelete = true;
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
        permissions: ["parties.suppliers"],
      });
    if (path === "/auth/csrf") return data({ token: "csrf" });
    if (path.startsWith("/modules/"))
      return data({ status: "FOUNDATION_ONLY" });
    if (path === "/suppliers/product-types") return data([category]);
    if (path === "/suppliers/supplier-one" && request.method() === "PATCH") {
      expect(request.headers()["x-csrf-token"]).toBe("csrf");
      supplier = { ...supplier, ...request.postDataJSON() };
      return data(supplier);
    }
    if (path === "/suppliers/supplier-one" && request.method() === "DELETE") {
      deletes++;
      expect(request.postDataJSON()).toEqual({ confirmed: true });
      if (rejectDelete)
        return route.fulfill({
          status: 409,
          json: {
            error: {
              message: "এই সাপ্লায়ারের লেনদেন আছে, তাই ডিলিট করা যাবে না।",
            },
          },
        });
      removed = true;
      return data({ id: supplier.id });
    }
    if (path === "/suppliers")
      return data({
        items: removed ? [] : [supplier],
        total: removed ? 0 : 1,
        page: 1,
        pageSize: 10,
      });
    return route.abort();
  });
  await page.goto("/suppliers");
  await page
    .getByRole("button", { name: "Edit Original Supplier", exact: true })
    .click();
  await expect(page.getByLabel("Supplier name", { exact: true })).toHaveValue(
    "Original Supplier",
  );
  await expect(page.locator('[name="address"]')).toHaveCount(0);
  await expect(
    page.getByLabel("Supplier product category", { exact: true }),
  ).toHaveValue(category.id);
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("Updated Supplier");
  await page
    .getByLabel("Supplier mobile number", { exact: true })
    .fill("01812345678");
  await page
    .getByRole("button", { name: "Update Supplier", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Updated Supplier" }),
  ).toContainText("01812345678");
  await page
    .getByRole("button", { name: "Delete Updated Supplier", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(deletes).toBe(0);
  await page
    .getByRole("button", { name: "Delete Updated Supplier", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete Supplier", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("লেনদেন আছে");
  rejectDelete = false;
  await page
    .getByRole("button", { name: "Delete Supplier", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit Updated Supplier", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Page 1 of 1", { exact: true }),
  ).toBeVisible();
});
