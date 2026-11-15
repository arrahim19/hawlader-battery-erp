import { test, expect } from "@playwright/test";
import type {
  CurrentUser,
  PurchaseList,
  PurchaseOptions,
} from "../../packages/api-client/src";

for (const trackingKind of ["BATTERY_UNIT", "QUANTITY"] as const) {
  test(`purchase adds ${trackingKind} inline without dialogs or serial numbers`, async ({
    page,
  }) => {
    const type = {
      id: "type",
      name: trackingKind === "BATTERY_UNIT" ? "Battery" : "Parts",
      trackingKind,
    };
    const submitted: Record<string, unknown>[] = [];
    let receipt: { items: object[] } | undefined;
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace("/api/v1", "");
      if (path === "/auth/me")
        return route.fulfill({
          json: {
            data: {
              id: "owner",
              name: "Owner",
              login: "owner",
              roles: ["OWNER"],
              permissions: [
                "purchases.manage",
                "inventory.receive",
                "catalog.write",
              ],
            },
          },
        });
      if (path === "/auth/csrf")
        return route.fulfill({ json: { data: { token: "csrf" } } });
      if (path.startsWith("/modules/"))
        return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
      if (path === "/purchases/options")
        return route.fulfill({
          json: {
            data: {
              types: [type],
              products: [],
              productNames: [
                { id: "name", name: "Fixed Product Name", typeId: type.id },
              ],
              suppliers: [
                {
                  id: "supplier",
                  name: "Supplier",
                  company: null,
                  productTypeId: type.id,
                },
              ],
              paymentAccounts: [],
            },
          },
        });
      if (path === "/products" && request.method() === "POST") {
        const body = request.postDataJSON();
        submitted.push(body);
        return route.fulfill({
          json: { data: { ...body, id: "created-product", type } },
        });
      }
      if (path === "/purchases/receive") {
        receipt = request.postDataJSON();
        return route.abort();
      }
      return route.abort();
    });
    await page.goto("/purchases/new");
    await page
      .getByLabel("Purchase product type", { exact: true })
      .selectOption("type");
    await page
      .getByLabel("Purchase product", { exact: true })
      .selectOption("Fixed Product Name");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New Product", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Purchase supplier").selectOption("supplier");
    if (trackingKind === "BATTERY_UNIT") {
      await page.getByLabel("Purchase product model").fill("6-EV-200A");
      await page.getByLabel("Purchase product capacity").fill("200");
    } else
      await expect(page.getByLabel("Purchase product capacity")).toHaveCount(0);
    await expect(page.getByLabel("Purchase product unit")).toHaveCount(0);
    const warranty = page.getByLabel("Purchase product warranty");
    await warranty.fill("06");
    await expect(warranty).toHaveValue("6");
    await page.getByLabel("Purchase quantity").fill("15");
    await page.getByLabel("Unit purchase price").fill("10000");
    await page
      .getByRole("button", { name: "Add to List", exact: true })
      .click();
    await expect(page.locator(".purchase-items tbody tr")).toHaveCount(1);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      name: "Fixed Product Name",
      category: "Fixed Product Name",
      unit: "pcs",
      warrantyMonths: 6,
      model: trackingKind === "BATTERY_UNIT" ? "6-EV-200A" : "",
    });
    expect(submitted[0]).not.toHaveProperty("identificationMethod");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator('input[type="date"]').fill("2026-11-15");
    await page.getByRole("button", { name: /Receive.*Confirm/ }).click();
    await expect.poll(() => receipt?.items.length).toBe(1);
    expect(receipt?.items[0]).not.toHaveProperty("identities");
  });
}

test("purchase navigation and delayed list responses keep the layout stable", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1366,
    height: 650,
  });
  const user: CurrentUser = {
    id: "layout-test-owner",
    name: "Layout Test Owner",
    login: "layout-test-owner",
    roles: ["OWNER"],
    permissions: [
      "dashboard.read",
      "purchases.manage",
      "inventory.read",
      "inventory.receive",
      "sales.manage",
      "replacements.intake.customer",
      "parties.customers",
      "parties.suppliers",
      "finance.read",
      "reports.operational",
      "access.manage",
      "settings.manage",
    ],
  };
  let blockModule = false;
  let releaseModule: (() => void) | undefined;
  let releaseList: (() => void) | undefined;
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // This browser-only fixture never reads or writes the business database.
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() !== "GET") {
      writes.push(request.url());
      return route.abort();
    }
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    if (path === "/modules/purchases") {
      if (blockModule)
        await new Promise<void>((resolve) => {
          releaseModule = resolve;
        });
      return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
    }
    if (path === "/purchases/options")
      return route.fulfill({
        json: {
          data: { suppliers: [], types: [], products: [], paymentAccounts: [] },
        },
      });
    if (path === "/purchases") {
      const requestedPage = Number(
        new URL(request.url()).searchParams.get("page"),
      );
      await new Promise<void>((resolve) => {
        releaseList = resolve;
      });
      const result: PurchaseList = {
        page: requestedPage,
        pageSize: 20,
        total: 21,
        items:
          requestedPage === 1
            ? Array.from({ length: 20 }, (_, index) => ({
                id: `layout-purchase-${index}`,
                number: `LAYOUT-PURCHASE-${index + 1}`,
                supplierReference:
                  "Long supplier invoice reference for layout verification",
                supplier: {
                  id: "layout-supplier",
                  name: "A supplier with a longer company name",
                },
                purchaseDate: "2026-11-13",
                status: "RECEIVED",
                itemCount: 2,
                quantity: "3",
                total: "123456.78",
                paid: "10000.00",
                due: "113456.78",
              }))
            : [],
      };
      return route.fulfill({ json: { data: result } });
    }
    return route.abort();
  });
  const shellGeometry = () =>
    page.evaluate(() =>
      [
        ".top-header",
        ".main-content",
        ".erp-tabs",
        ".page-footer",
        ".desktop-sidebar .brand",
        ".desktop-sidebar .sidebar-nav",
        ".erp-tabs .erp-tab:first-child",
        ".erp-tabs .erp-tab:last-child",
        ".erp-tabs .erp-tab:first-child svg",
        ".erp-tabs .erp-tab:last-child svg",
      ].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return {
          selector,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
  const listGeometry = () =>
    page.evaluate(() =>
      [
        ".purchase-list-panel",
        ".purchase-list-body",
        ".purchase-list-panel .erp-pager",
        ...Array.from(
          { length: 9 },
          (_, index) => `.purchase-list-panel th:nth-child(${index + 1})`,
        ),
      ].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return {
          selector,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
  await page.goto("/purchases");
  const tabs = page.getByRole("navigation", {
    name: "Module tabs",
    exact: true,
  });
  await expect(page.getByLabel("Purchase supplier")).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const original = await shellGeometry();
  blockModule = true;
  await tabs.getByRole("link", { name: "Purchase List", exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/list$/);
  await expect.poll(() => Boolean(releaseModule)).toBe(true);
  await expect(
    page.getByText("Loading purchases...", { exact: true }),
  ).toBeVisible();
  expect(await shellGeometry()).toEqual(original);
  const reserved = await listGeometry();
  releaseModule!();
  await expect.poll(() => Boolean(releaseList)).toBe(true);
  expect(await listGeometry()).toEqual(reserved);
  releaseList!();
  await expect(
    page.getByRole("cell", { name: "RECEIVED", exact: true }),
  ).toHaveCount(20);
  expect(await listGeometry()).toEqual(reserved);
  expect(await shellGeometry()).toEqual(original);

  releaseList = undefined;
  await page
    .getByRole("button", { name: "Next purchase page", exact: true })
    .click();
  await expect.poll(() => Boolean(releaseList)).toBe(true);
  expect(await listGeometry()).toEqual(reserved);
  releaseList!();
  await expect(
    page.getByText("No records to display", { exact: true }),
  ).toBeVisible();
  expect(await listGeometry()).toEqual(reserved);
  expect(await shellGeometry()).toEqual(original);
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  // A stable desktop scrollbar gutter reserves space even on short pages.
  expect(viewport.width).toBeLessThanOrEqual(
    info.project.name === "mobile" ? 390 : 1366,
  );
  expect(viewport.height).toBe(650);

  blockModule = false;
  await tabs.getByRole("link", { name: "New Purchase", exact: true }).click();
  await expect(page.getByLabel("Purchase supplier")).toBeEnabled();
  expect(await shellGeometry()).toEqual(original);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("new purchase form keeps its geometry while options load and retry", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1366,
    height: 650,
  });
  const user: CurrentUser = {
    id: "purchase-content-owner",
    name: "Purchase Content Owner",
    login: "purchase-content-owner",
    roles: ["OWNER"],
    permissions: [
      "purchases.manage",
      "inventory.receive",
      "catalog.write",
      "finance.write",
    ],
  };
  const options: PurchaseOptions = {
    productNames: [
      {
        id: "inventory-name",
        name: "Inventory Battery Name",
        typeId: "battery-type",
      },
    ],
    suppliers: [
      {
        id: "supplier-one",
        name: "Example Supplier",
        company: null,
        productTypeId: "battery-type",
      },
      {
        id: "supplier-parts",
        name: "Parts Supplier",
        company: null,
        productTypeId: "part-type",
      },
    ],
    types: [
      { id: "battery-type", name: "Battery", trackingKind: "BATTERY_UNIT" },
      { id: "part-type", name: "Auto Parts", trackingKind: "QUANTITY" },
      { id: "empty-type", name: "Empty Active Type", trackingKind: "QUANTITY" },
    ],
    products: [
      {
        id: "battery-one",
        name: "Example Battery",
        model: "12V 100Ah",
        warrantyMonths: 6,
        capacityAh: "100",
        unit: "pcs",

        type: {
          id: "battery-type",
          name: "Battery",
          trackingKind: "BATTERY_UNIT",
        },
      },
      {
        id: "part-one",
        name: "Example Auto Part",
        model: "Standard",
        unit: "pcs",

        type: { id: "part-type", name: "Auto Parts", trackingKind: "QUANTITY" },
      },
    ],
    paymentAccounts: [{ id: "cash-one", name: "Cash", paymentMethod: "CASH" }],
  };
  options.products.push({
    ...options.products[0],
    id: "battery-second-model",
    model: "12V 200Ah",
  });
  let blockModule = true;
  let optionsFail = false;
  let emptyOptions = false;
  let releaseModule: (() => void) | undefined;
  let releaseOptions: (() => void) | undefined;
  const writes: string[] = [];
  const unhandled: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() !== "GET") {
      writes.push(path);
      return route.abort();
    }
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    if (path === "/modules/purchases") {
      if (blockModule)
        await new Promise<void>((resolve) => {
          releaseModule = resolve;
        });
      return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
    }
    if (path === "/purchases/options") {
      await new Promise<void>((resolve) => {
        releaseOptions = resolve;
      });
      return optionsFail
        ? route.fulfill({
            status: 503,
            json: { error: { message: "Unable to load purchase options" } },
          })
        : route.fulfill({
            json: {
              data: emptyOptions
                ? { ...options, suppliers: [], products: [] }
                : options,
            },
          });
    }
    if (path === "/purchases")
      return route.fulfill({
        json: { data: { items: [], total: 0, page: 1, pageSize: 20 } },
      });
    if (path === "/catalog")
      return route.fulfill({
        json: {
          data: {
            types: options.types.map((type) => ({
              ...type,
              productCount: type.id === "empty-type" ? 0 : 1,
            })),
            brands: [],
            categories: [
              {
                id: "inventory-name",
                name: "Inventory Battery Name",
                typeIds: ["battery-type"],
                productCount: 0,
              },
              {
                id: "parts-name",
                name: "Inventory Parts Name",
                typeIds: ["part-type"],
                productCount: 0,
              },
            ],
            totalProducts: 2,
          },
        },
      });
    unhandled.push(path);
    return route.abort();
  });
  const formGeometry = () =>
    page.evaluate(() =>
      [
        ".purchase-page",
        ".purchase-page > form",
        ".purchase-fieldset",
        ".purchase-page .erp-form-grid",
        ".purchase-page .erp-form-main",
        ".purchase-details",
        ".purchase-details > .erp-panel-heading",
        ".purchase-details > .erp-form-body",
        ".purchase-basics",
        ".purchase-basics > .erp-field",
        ".purchase-basics > .erp-field > span",
        ".purchase-product-heading",
        ".purchase-product-heading > h3",
        ".purchase-product-heading > button",
        ".purchase-page .erp-add-products",
        ".purchase-page .erp-add-products .erp-field",
        ".purchase-page .erp-add-products .erp-field > span",
        ".purchase-items",
        ".purchase-items > .erp-panel-heading",
        ".purchase-items .erp-table thead",
        ".purchase-items .erp-table th",
        ".purchase-page .erp-form-side",
        ".purchase-page .erp-form-side > .erp-panel",
        ".purchase-page .erp-summary-title",
        ".purchase-page .erp-summary-total",
        ".purchase-page .erp-form-actions",
        ".purchase-page .erp-form-actions > button",
        ".page-footer",
      ].flatMap((selector) =>
        Array.from(document.querySelectorAll(selector), (node) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { selector, x, y, width, height };
        }),
      ),
    );
  await page.goto("/purchases/new");
  await expect.poll(() => Boolean(releaseModule)).toBe(true);
  await expect(page.getByLabel("Purchase supplier")).toBeDisabled();
  const productType = page.getByLabel("Purchase product type", { exact: true });
  const productSelect = page.getByLabel("Purchase product", { exact: true });
  const quantity = page.getByLabel("Purchase quantity", { exact: true });
  const unitPrice = page.getByLabel("Unit purchase price", { exact: true });
  await expect(productType).toBeDisabled();
  await expect(productSelect).toBeDisabled();
  await page.evaluate(() => document.fonts.ready);
  const reserved = await formGeometry();
  blockModule = false;
  releaseModule!();
  await expect.poll(() => Boolean(releaseOptions)).toBe(true);
  await expect(productType).toBeDisabled();
  await expect(productSelect).toBeDisabled();
  expect(await formGeometry()).toEqual(reserved);
  releaseOptions!();
  await expect(
    page.getByLabel("Purchase supplier").locator("option"),
  ).toHaveCount(1);
  await expect(productType).toBeEnabled();
  await expect(productType.locator("option")).toHaveCount(4);
  await expect(productType.locator("option")).toHaveText([
    /./,
    "Battery",
    "Auto Parts",
    "Empty Active Type",
  ]);
  await expect(productSelect).toBeDisabled();
  await expect(productSelect.locator("option")).toHaveCount(1);
  await expect(productSelect.locator("option")).toHaveText(
    "আগে পণ্যের ধরন নির্বাচন করুন",
  );
  expect(await formGeometry()).toEqual(reserved);

  await productType.selectOption("battery-type");
  await expect(productSelect).toBeEnabled();
  await expect(productSelect.locator("option")).toHaveCount(3);
  await productSelect.selectOption("Inventory Battery Name");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Purchase product capacity")).toBeVisible();
  await productSelect.selectOption("Example Battery");
  await expect(page.getByLabel("Purchase product model")).toHaveValue("");
  const modelSelect = page.getByLabel("Purchase product model", {
    exact: true,
  });
  await modelSelect.fill("12V 200Ah");
  await expect(productSelect).toHaveValue("Example Battery");
  await modelSelect.fill("12V 100Ah");
  await expect(page.getByLabel("Purchase product warranty")).toHaveValue("");
  await expect(page.getByLabel("Purchase product capacity")).toHaveValue("");
  await expect(page.locator('input[type="date"]')).toHaveValue("");
  await quantity.fill("2");
  await unitPrice.fill("1500.00");
  await expect(
    page.getByRole("button", { name: /Battery Identification/ }),
  ).toHaveCount(0);
  expect(await formGeometry()).toEqual(reserved);
  // A type switch clears the draft line.
  await productType.selectOption("part-type");
  await expect(
    productSelect.locator('option[value="Inventory Battery Name"]'),
  ).toHaveCount(0);
  await expect(productSelect).toHaveValue("");
  await expect(quantity).toHaveValue("1");
  await expect(unitPrice).toHaveValue("");
  await expect(productSelect.locator("option")).toHaveCount(2);
  await expect(
    productSelect.locator('option[value="Example Auto Part"]'),
  ).toHaveCount(1);
  await expect(
    productSelect.locator('option[value="Example Battery"]'),
  ).toHaveCount(0);
  await productSelect.selectOption("Example Auto Part");
  await expect(
    page.getByRole("button", { name: /Battery Identification/ }),
  ).toHaveCount(0);
  expect(await formGeometry()).toEqual(reserved);
  await productType.selectOption("empty-type");
  await expect(productSelect).toBeDisabled();
  await expect(productSelect).toHaveValue("");
  await expect(productSelect.locator("option")).toHaveCount(1);
  await expect(productSelect.locator("option")).toHaveText(
    "এই ধরনে কোনো পণ্য নেই",
  );
  await expect(
    page.getByRole("button", { name: "Add to List", exact: true }),
  ).toBeDisabled();
  expect(await formGeometry()).toEqual(reserved);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const section = async (index: number) => {
    if (info.project.name !== "mobile") return;
    const grid = page.locator(".purchase-page .erp-form-grid");
    const target = await grid.evaluate((node, index) => {
      if (index === 2) return node.scrollWidth - node.clientWidth;
      return (
        index *
        (node.clientWidth + parseFloat(getComputedStyle(node).columnGap))
      );
    }, index);
    await page
      .getByRole("navigation", { name: "Purchase sections", exact: true })
      .getByRole("button")
      .nth(index)
      .click();
    await expect
      .poll(() =>
        grid.evaluate(
          (node, target) => Math.abs(node.scrollLeft - target) < 1,
          target,
        ),
      )
      .toBe(true);
  };
  await productType.selectOption("battery-type");
  await productSelect.selectOption("Example Battery");
  await page.getByLabel("Purchase product model").fill("12V 100Ah");
  await expect(quantity).toHaveValue("1");
  await expect(unitPrice).toHaveValue("");
  await unitPrice.fill("1500.00");
  await page.getByLabel("Purchase product capacity").fill("100");
  await expect(
    page.getByLabel("Battery 1 serial number", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add to List", exact: true }).click();
  await expect(page.locator(".purchase-items tbody tr")).toHaveCount(1);
  await expect(productType).toHaveValue("battery-type");
  await expect(productSelect).toHaveValue("");
  expect(await formGeometry()).toEqual(reserved);
  await section(1);
  const populated = await formGeometry();
  await page
    .getByRole("button", { name: "Remove Example Battery", exact: true })
    .click();
  await expect(page.locator(".purchase-items tbody tr")).toHaveCount(0);
  // The narrow cart scrolls horizontally to reach Remove; compare the same view.
  await page.locator(".purchase-items .erp-table-wrap").evaluate((node) => {
    node.scrollLeft = 0;
  });
  expect(await formGeometry()).toEqual(populated);
  await section(2);
  const paymentGeometry = await formGeometry();
  for (const type of ["full", "partial", "due"]) {
    await page.getByLabel("Payment Type", { exact: true }).selectOption(type);
    expect(await formGeometry()).toEqual(paymentGeometry);
  }
  await section(0);
  expect(await formGeometry()).toEqual(reserved);

  const tabs = page.getByRole("navigation", {
    name: "Module tabs",
    exact: true,
  });
  await tabs.getByRole("link", { name: "Purchase List", exact: true }).click();
  await expect(
    page.getByText("No records to display", { exact: true }),
  ).toBeVisible();
  blockModule = true;
  optionsFail = true;
  releaseModule = undefined;
  releaseOptions = undefined;
  await tabs.getByRole("link", { name: "New Purchase", exact: true }).click();
  await expect.poll(() => Boolean(releaseModule)).toBe(true);
  expect(await formGeometry()).toEqual(reserved);
  releaseModule!();
  await expect.poll(() => Boolean(releaseOptions)).toBe(true);
  expect(await formGeometry()).toEqual(reserved);
  releaseOptions!();
  await expect(page.locator(".purchase-page").getByRole("alert")).toContainText(
    "Unable to load purchase options",
  );
  expect(await formGeometry()).toEqual(reserved);

  optionsFail = false;
  releaseOptions = undefined;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => Boolean(releaseOptions)).toBe(true);
  expect(await formGeometry()).toEqual(reserved);
  releaseOptions!();
  await expect(
    page.getByLabel("Purchase supplier").locator("option"),
  ).toHaveCount(1);
  await expect(page.locator(".purchase-page").getByRole("alert")).toHaveCount(
    0,
  );
  expect(await formGeometry()).toEqual(reserved);
  blockModule = false;
  await tabs.getByRole("link", { name: "Purchase List", exact: true }).click();
  await expect(
    page.getByText("No records to display", { exact: true }),
  ).toBeVisible();
  emptyOptions = true;
  releaseOptions = undefined;
  await tabs.getByRole("link", { name: "New Purchase", exact: true }).click();
  await expect.poll(() => Boolean(releaseOptions)).toBe(true);
  expect(await formGeometry()).toEqual(reserved);
  releaseOptions!();
  await expect(
    page.getByLabel("Purchase supplier").locator("option"),
  ).toHaveCount(1);
  await productType.selectOption("battery-type");
  await expect(
    page.locator('.purchase-details a[href="/suppliers/new"]'),
  ).toBeVisible();
  expect(await formGeometry()).toEqual(reserved);
  expect(writes).toEqual([]);
  expect(unhandled).toEqual([]);
  expect(errors).toEqual([]);
});
