import { test, expect, type Route } from "@playwright/test";

test("inventory keeps categories across filters, navigation and reload while revalidating", async ({
  page,
}, info) => {
  let hold = false;
  let catalogRequests = 0;
  let savedName = "Auto Life";
  let userId = "inventory-cache-owner";
  const waiting: Route[] = [];
  const metadata = (name = "Battery") => ({
    types: [
      { id: "battery", name, trackingKind: "BATTERY_UNIT", productCount: 0 },
    ],
    categories: [
      {
        id: "auto",
        name: savedName,
        typeIds: ["battery"],
        productCountsByType: { battery: 0 },
        productCount: 0,
      },
    ],
    brands: [],
    totalProducts: 0,
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === "/auth/me")
      return data({
        id: userId,
        login: "owner",
        name: "Owner",
        roles: ["OWNER"],
        permissions: [
          "inventory.read",
          "catalog.read",
          "catalog.write",
          "settings.manage",
        ],
      });
    if (path === "/auth/csrf") return data({ token: "mock-csrf" });
    if (path === "/categories" && route.request().method() === "POST") {
      savedName = route.request().postDataJSON().name;
      return data({ id: "auto" });
    }
    if (path.startsWith("/modules/"))
      return data({ status: "FOUNDATION_ONLY" });
    if (path === "/settings/shop") return data(null);
    if (path === "/catalog") {
      catalogRequests++;
      if (hold) {
        waiting.push(route);
        return;
      }
      return data(metadata());
    }
    if (path === "/products")
      return data({ items: [], total: 0, page: 1, pageSize: 10 });
    return route.abort();
  });
  const filters = page.getByRole("complementary", { name: "Product filters" });
  const battery = () =>
    filters.getByRole("button", { name: "Battery 0", exact: true });
  async function navigate(name: string) {
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name, exact: true })
      .click();
  }
  await page.goto("/inventory");
  await expect(battery()).toBeVisible();
  await expect(filters.getByText("Auto Life", { exact: true })).toBeVisible();
  const initialRequests = catalogRequests;
  await battery().click();
  await expect(battery()).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("main").getByText("No records to display"),
  ).toBeVisible();
  expect(catalogRequests).toBe(initialRequests);

  await navigate("Settings");
  await expect(page).toHaveURL(/\/settings$/);
  hold = true;
  await navigate("Inventory / Stock");
  await expect.poll(() => waiting.length).toBeGreaterThan(0);
  // Revalidation is still blocked, so these must come from the session cache.
  await expect(battery()).toBeVisible();
  await expect(filters.getByText("Auto Life", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Loading products" }),
  ).toHaveCount(0);
  for (const route of waiting.splice(0))
    await route.fulfill({ json: { data: metadata() } });

  await page.reload();
  await expect.poll(() => waiting.length).toBeGreaterThan(0);
  await expect(battery()).toBeVisible();
  for (const route of waiting.splice(0))
    await route.fulfill({ json: { data: metadata("Updated Battery") } });
  await expect(
    filters.getByRole("button", { name: "Updated Battery 0", exact: true }),
  ).toBeVisible();

  // A successful write must discard cached metadata and fetch the saved name.
  hold = false;
  await filters
    .getByRole("button", { name: "Updated Battery product actions" })
    .click();
  await page.getByRole("menuitem", { name: "Add Product Name" }).click();
  await page
    .getByRole("textbox", { name: "Product name", exact: true })
    .fill("Fresh Name");
  await page.getByRole("button", { name: "Save Product Name" }).click();
  await expect(filters.getByText("Fresh Name", { exact: true })).toBeVisible();

  // Another authenticated account must not inherit this account's saved catalog.
  userId = "another-owner";
  hold = true;
  await page.reload();
  await expect.poll(() => waiting.length).toBeGreaterThan(0);
  await expect(filters.getByText("Fresh Name", { exact: true })).toHaveCount(0);
  for (const route of waiting.splice(0))
    await route.fulfill({ json: { data: metadata() } });
  await expect(filters.getByText("Fresh Name", { exact: true })).toBeVisible();
});
