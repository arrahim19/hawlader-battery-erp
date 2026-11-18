import { expect, test } from "@playwright/test";

test("purchase quick add saves names and suppliers and stays open on outside clicks", async ({
  page,
}, info) => {
  const writes: { path: string; body: Record<string, string> }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const suppliers: {
    id: string;
    name: string;
    company: string;
    productTypeId: string;
  }[] = [];
  const productNames: { id: string; name: string; typeId: string }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (path === "/categories") {
        const created = {
          id: "name-new",
          name: body.name,
          typeId: body.typeId,
        };
        productNames.push(created);
        return route.fulfill({ json: { data: created } });
      }
      if (path === "/suppliers") {
        const created = { ...body, id: "supplier-new" };
        suppliers.push(created);
        return route.fulfill({ json: { data: created } });
      }
      return route.abort();
    }
    if (path === "/auth/me")
      return route.fulfill({
        json: {
          data: {
            id: "quick-add-owner",
            name: "Owner",
            login: "owner",
            roles: ["OWNER"],
            permissions: [
              "purchases.manage",
              "inventory.receive",
              "catalog.write",
              "parties.suppliers",
            ],
          },
        },
      });
    if (path === "/auth/csrf")
      return route.fulfill({ json: { data: { token: "csrf" } } });
    if (path.startsWith("/modules/"))
      return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
    if (path === "/purchases/recent")
      return route.fulfill({ json: { data: { items: [] } } });
    if (path === "/purchases/options")
      return route.fulfill({
        json: {
          data: {
            types: [
              { id: "parts-type", name: "Parts", trackingKind: "QUANTITY" },
            ],
            products: [],
            productNames,
            suppliers,
            paymentAccounts: [],
          },
        },
      });
    return route.abort();
  });
  await page.goto("/purchases/new");
  await page
    .getByLabel("Purchase product type", { exact: true })
    .selectOption("parts-type");
  await page.getByRole("button", { name: "Add Product", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add Product", exact: true });
  await dialog.getByLabel("Product Name").fill("New Motor");
  await page.mouse.click(2, 180);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Product Name")).toHaveValue("New Motor");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByLabel("Purchase product", { exact: true }),
  ).toHaveValue("New Motor");
  await page.getByLabel("Purchase quantity").fill("10");
  await page.getByRole("button", { name: "Add Supplier", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Add Supplier", exact: true });
  await expect(dialog.locator('[name="address"]')).toHaveCount(0);
  await dialog.getByLabel("Supplier Name").fill("New Supplier");
  await dialog.getByLabel("Mobile Number").fill("abc");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("valid mobile");
  expect(writes).toHaveLength(1);
  await dialog.getByLabel("Mobile Number").fill("01712345678");
  await dialog.getByLabel("Company / Brand").fill("Motor House");
  await page.mouse.click(2, 180);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Purchase supplier")).toHaveValue(
    "supplier-new",
  );
  await expect(
    page.getByLabel("Purchase product", { exact: true }),
  ).toHaveValue("New Motor");
  await expect(page.getByLabel("Purchase quantity")).toHaveValue("10");
  expect(writes.map(({ path }) => path)).toEqual(["/categories", "/suppliers"]);
  expect(writes[1].body).toMatchObject({
    productTypeId: "parts-type",
    name: "New Supplier",
    phone: "01712345678",
    company: "Motor House",
  });
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `.local/purchase-quick-add-${info.project.name}.png`,
  });
});
