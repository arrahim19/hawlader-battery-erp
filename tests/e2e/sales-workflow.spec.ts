import { test, expect, type Page } from "@playwright/test";
import type {
  CurrentUser,
  CustomerRecord,
  SalesOptions,
  SalesList,
  DashboardData,
} from "../../packages/api-client/src";

const owner: CurrentUser = {
  id: "sales-workflow-owner",
  name: "Sales Workflow Owner",
  login: "sales-workflow-owner",
  roles: ["OWNER"],
  permissions: [
    "dashboard.read",
    "sales.manage",
    "parties.customers",
    "finance.read",
    "finance.write",
  ],
};
const existingCustomer: CustomerRecord = {
  id: "existing-customer",
  name: "Existing Customer",
  phone: "01700000001",
  address: "Dhaka",
  active: true,
  createdAt: "2026-11-14T06:00:00.000Z",

  totalSales: "0.00",
  due: "0.00",
};

type SubmittedSale = {
  customerId: string;
  saleDate: string;
  notes?: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: string;
    batteryUnitIds?: string[];
  }[];
  paidAmount: string;
  paymentAccountId?: string;
};

async function mockSalesWorkspace(page: Page, extraProducts = 0) {
  const customers = [structuredClone(existingCustomer)];
  const options: SalesOptions = {
    types: [
      { id: "parts", name: "Auto Parts", trackingKind: "QUANTITY" },
      { id: "batteries", name: "Battery", trackingKind: "BATTERY_UNIT" },
      { id: "empty-type", name: "Empty Active Type", trackingKind: "QUANTITY" },
    ],
    products: [
      {
        id: "part-one",
        name: "Sale Test Auto Part",
        model: "Standard",
        unit: "pcs",
        type: { id: "parts", name: "Auto Parts", trackingKind: "QUANTITY" },
        defaultSellingPrice: "100.00",
        availableQuantity: "10",
      },
      {
        id: "battery-one",
        name: "Sale Test Battery",
        model: "12V 100Ah",
        unit: "pcs",
        type: {
          id: "batteries",
          name: "Battery",
          trackingKind: "BATTERY_UNIT",
        },
        defaultSellingPrice: "1500.00",
        availableQuantity: "2",
      },
    ],
    customers,
    paymentAccounts: [
      { id: "cash-one", name: "Cash Counter", paymentMethod: "CASH" },
    ],
  };
  for (let index = 0; index < extraProducts; index++)
    options.products.push({
      ...options.products[0],
      id: `extra-part-${index}`,
      name: `Extra Part ${index}`,
    });
  const submittedCustomers: Record<string, unknown>[] = [];
  const submittedSales: { body: SubmittedSale; key: string; csrf: string }[] =
    [];
  const unhandled: string[] = [];
  const errors: string[] = [];
  let failCompletion = true;
  const recentSales: DashboardData["recentSales"] = [];
  const savedSales: SalesList["items"] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Every API request, including writes, is fulfilled inside the browser fixture.
  // No customer, sale, payment, or stock change reaches the business database.
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = request.method();
    if (method === "GET" && path === "/auth/me")
      return route.fulfill({ json: { data: owner } });
    if (method === "GET" && path === "/auth/csrf")
      return route.fulfill({ json: { data: { token: "sales-browser-csrf" } } });
    if (method === "GET" && path.startsWith("/modules/"))
      return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
    if (method === "GET" && path === "/sales/options")
      return route.fulfill({ json: { data: options } });
    if (method === "GET" && path === "/customers") {
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      const items = customers.filter((customer) =>
        [customer.name, customer.phone].join(" ").toLowerCase().includes(query),
      );
      return route.fulfill({
        json: {
          data: {
            items,
            total: items.length,
            page: Number(url.searchParams.get("page") ?? 1),
            pageSize: Number(url.searchParams.get("pageSize") ?? 10),
            summary: {
              total: customers.length,
              active: customers.length,
              credit: customers.filter((customer) => Number(customer.due) > 0)
                .length,
              totalSales: customers
                .reduce(
                  (total, customer) => total + Number(customer.totalSales),
                  0,
                )
                .toFixed(2),
              totalDue: customers
                .reduce((total, customer) => total + Number(customer.due), 0)
                .toFixed(2),
            },
          },
        },
      });
    }
    if (method === "GET" && path === "/sales") {
      const page = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
      return route.fulfill({
        json: {
          data: {
            items: savedSales.slice((page - 1) * pageSize, page * pageSize),
            total: savedSales.length,
            page,
            pageSize,
          },
        },
      });
    }
    if (method === "GET" && path === "/dashboard")
      return route.fulfill({
        json: {
          data: {
            businessDate: "2026-11-14",
            from: "2026-11-14",
            to: "2026-11-14",
            counts: {
              products: 2,
              customers: customers.length,
              availableStock: "12",
              pendingReplacements: 0,
              sentToCompany: 0,
              replacementsReceived: 0,
              lowStock: 0,
            },
            recentSales,
            lowStock: [],
            salesTrend: [],
          },
        },
      });
    if (method === "POST" && path === "/customers") {
      const body = request.postDataJSON() as Record<string, string>;
      submittedCustomers.push(body);
      const customer: CustomerRecord = {
        id: "created-customer",
        name: body.name,
        phone: body.phone,
        address: body.address || null,
        active: true,
        createdAt: "2026-11-14T06:05:00.000Z",
        totalSales: "0.00",
        due: "0.00",
      };
      customers.push(customer);
      return route.fulfill({ status: 201, json: { data: customer } });
    }
    if (method === "POST" && path === "/sales/complete") {
      const body = request.postDataJSON() as SubmittedSale;
      submittedSales.push({
        body,
        key: request.headers()["idempotency-key"] ?? "",
        csrf: request.headers()["x-csrf-token"] ?? "",
      });
      if (failCompletion) {
        failCompletion = false;
        return route.fulfill({
          status: 503,
          json: {
            error: { message: "Sale service is temporarily unavailable." },
          },
        });
      }
      const total = body.items
        .reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0)
        .toFixed(2);
      const due = (Number(total) - Number(body.paidAmount)).toFixed(2);
      const customer = customers.find((item) => item.id === body.customerId)!;
      customer.totalSales = total;
      customer.due = due;
      savedSales.unshift({
        id: "completed-sale",
        invoiceNumber: "SALE-E2E-001",
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
        },
        saleDate: body.saleDate,
        status: "CONFIRMED",
        subtotal: total,
        total,
        paid: body.paidAmount,
        due,
        quantity: String(
          body.items.reduce((sum, item) => sum + item.quantity, 0),
        ),
        itemCount: body.items.length,
      });
      recentSales.push({
        id: "completed-sale",
        invoiceNumber: "SALE-E2E-001",
        customer: customer.name,
        soldAt: body.saleDate + "T06:00:00.000Z",
        total,
        status: "CONFIRMED",
      });
      return route.fulfill({
        status: 201,
        json: {
          data: {
            id: "completed-sale",
            invoiceNumber: "SALE-E2E-001",
            customerId: body.customerId,
            subtotal: total,
            total,
            paid: body.paidAmount,
            due,
            quantity: body.items.reduce((sum, item) => sum + item.quantity, 0),
          },
        },
      });
    }
    unhandled.push(method + " " + path);
    return route.abort();
  });
  return { submittedCustomers, submittedSales, savedSales, unhandled, errors };
}

async function shellGeometry(page: Page) {
  return page.evaluate(() =>
    [
      ".top-header",
      ".header-controls",
      ".notification-button",
      ".account-trigger",
      ".desktop-sidebar",
      ".desktop-sidebar .brand",
      ".desktop-sidebar .sidebar-nav",
      ".desktop-sidebar .nav-item",
      ".desktop-sidebar .nav-item > svg",
      ".desktop-sidebar .sidebar-bottom",
    ].flatMap((selector) =>
      Array.from(document.querySelectorAll(selector), (node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { selector, x, y, width, height };
      }),
    ),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function salePanel(page: Page, name: "Details" | "Items" | "Payment") {
  await expect(page.locator(".sales-entry-workspace")).toBeVisible();
  const panels = page.getByRole("navigation", { name: "Sale panels" });
  if (await panels.isVisible())
    await panels.getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

async function expectCartProduct(page: Page, name: string) {
  const previous = page.getByRole("button", {
    name: "Previous sale items page",
    exact: true,
  });
  const next = page.getByRole("button", {
    name: "Next sale items page",
    exact: true,
  });
  while (await previous.isEnabled()) await previous.click();
  const row = page
    .getByRole("table", { name: "Sale items", exact: true })
    .locator("tbody tr")
    .filter({ hasText: name });
  for (let index = 0; index < 100; index++) {
    if (await row.count()) {
      await expect(row).toBeVisible();
      return;
    }
    if (await next.isDisabled()) break;
    await next.click();
  }
  throw new Error("Missing cart product: " + name);
}

test("every sale row requires category, product, positive quantity and price", async ({
  page,
}) => {
  const fixture = await mockSalesWorkspace(page);
  await page.goto("/sales");
  await salePanel(page, "Details");
  await page
    .getByLabel("Select customer", { exact: true })
    .selectOption("existing-customer");
  const row = page.getByRole("group", { name: "Product 1", exact: true });
  for (const name of [
    "Sales product category",
    "Sales product",
    "Sales quantity",
    "Unit sale price",
  ]) {
    await expect(row.getByLabel(name, { exact: true })).toHaveAttribute(
      "required",
      "",
    );
  }
  await row
    .getByLabel("Sales product category", { exact: true })
    .selectOption("parts");
  await row
    .getByLabel("Sales product", { exact: true })
    .selectOption("part-one");
  const quantity = row.getByLabel("Sales quantity", { exact: true });
  const price = row.getByLabel("Unit sale price", { exact: true });
  await quantity.fill("0");
  await price.fill("0");
  expect(
    await quantity.evaluate((node: HTMLInputElement) => node.checkValidity()),
  ).toBe(false);
  expect(
    await price.evaluate((node: HTMLInputElement) => node.checkValidity()),
  ).toBe(false);
  await quantity.fill("1");
  await price.fill("100.00");
  expect(
    await page
      .locator(".sales-form")
      .evaluate((form: HTMLFormElement) => form.checkValidity()),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Add Another Product", exact: true })
    .click();
  await salePanel(page, "Payment");
  await page.getByRole("button", { name: "Confirm Sale", exact: true }).click();
  expect(fixture.submittedSales).toHaveLength(0);
  await salePanel(page, "Details");
  await page
    .getByRole("button", { name: "Remove product 2", exact: true })
    .click();
  expect(
    await page
      .locator(".sales-form")
      .evaluate((form: HTMLFormElement) => form.checkValidity()),
  ).toBe(true);
  expect(fixture.errors).toEqual([]);
});

test("saved sales appear on entry, survive reload, and paginate without changing the draft", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1366,
    height: 650,
  });
  const fixture = await mockSalesWorkspace(page);
  fixture.savedSales.push(
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `saved-${index}`,
      invoiceNumber: `SAVED-${index + 1}`,
      customer: {
        id: existingCustomer.id,
        name: existingCustomer.name,
        phone: existingCustomer.phone,
      },
      saleDate: "2026-11-16",
      status: "CONFIRMED",
      subtotal: "100.00",
      total: "100.00",
      paid: "75.00",
      due: "25.00",
      quantity: "1",
      itemCount: 1,
    })),
  );
  await page.goto("/sales");
  await salePanel(page, "Items");
  const history = page.getByRole("table", {
    name: "Recent sales",
    exact: true,
  });
  await expect(history).toContainText("SAVED-1");
  await expect(history).toContainText("Existing Customer");
  await expect(history.locator("tbody tr").first()).toContainText("75.00");
  await expect(history.locator("tbody tr").first()).toContainText("25.00");
  await page
    .getByRole("button", { name: "Next recent sales page", exact: true })
    .click();
  await expect(
    history.locator("tbody tr").first().locator("td").first(),
  ).not.toHaveText("SAVED-1");
  await page.reload();
  await salePanel(page, "Items");
  await expect(
    history.locator("tbody tr").first().locator("td").first(),
  ).toHaveText("SAVED-1");
  await salePanel(page, "Details");
  await page
    .getByLabel("Sales product category", { exact: true })
    .first()
    .selectOption("parts");
  await page
    .getByLabel("Sales product", { exact: true })
    .first()
    .selectOption("part-one");
  await page.getByLabel("Sales quantity", { exact: true }).first().fill("2");
  await page
    .getByRole("button", { name: "Add Another Product", exact: true })
    .click();
  await salePanel(page, "Items");
  await expect(
    page.getByRole("table", { name: "Sale items", exact: true }),
  ).toContainText("Sale Test Auto Part");
  await page.getByRole("button", { name: "Recent Sales", exact: true }).click();
  await expect(history).toContainText("SAVED-1");
  await page
    .getByRole("button", { name: "Sale Items (1)", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Sale items", exact: true }),
  ).toContainText("Sale Test Auto Part");
  expect(fixture.submittedSales).toHaveLength(0);
  expect(fixture.unhandled).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("sale entry and long carts fit short viewports without vertical scrolling", async ({
  page,
}, info) => {
  const fixture = await mockSalesWorkspace(page, 4);
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
    await page.goto("/sales/new");
    await page
      .getByLabel("Select customer", { exact: true })
      .selectOption("existing-customer");
    const assertFits = async () => {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const root = document.documentElement;
            const main = document.querySelector(".main-content")!;
            const action = document
              .querySelector(".sales-confirm-actions")!
              .getBoundingClientRect();
            return (
              root.scrollHeight <= innerHeight &&
              root.scrollWidth <= innerWidth &&
              main.scrollHeight <= main.clientHeight + 1 &&
              action.bottom <= innerHeight
            );
          }),
        )
        .toBe(true);
      await expect(
        page.getByRole("button", { name: "Add Note", exact: true }),
      ).toBeInViewport();
      await expect(
        page.getByRole("button", { name: "Confirm Sale", exact: true }),
      ).toBeInViewport();
    };
    await assertFits();
    await page
      .getByLabel("Sales product category", { exact: true })
      .first()
      .selectOption("parts");
    for (const id of [
      "part-one",
      "extra-part-0",
      "extra-part-1",
      "extra-part-2",
      "extra-part-3",
    ]) {
      await page
        .getByLabel("Sales product", { exact: true })
        .first()
        .selectOption(id);
      await page
        .getByLabel("Sales quantity", { exact: true })
        .first()
        .fill("1");
      await page
        .getByRole("button", { name: "Add Another Product", exact: true })
        .click();
    }
    await salePanel(page, "Items");
    await assertFits();
    const previous = page.getByRole("button", {
      name: "Previous sale items page",
      exact: true,
    });
    const next = page.getByRole("button", {
      name: "Next sale items page",
      exact: true,
    });
    while (await previous.isEnabled()) await previous.click();
    const names = new Set<string>();
    do {
      for (const name of await page
        .locator(".sales-cart-panel tbody td:first-child")
        .allTextContents())
        names.add(name);
      await expect
        .poll(() =>
          page
            .locator(".sales-cart-body .erp-table-wrap")
            .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        )
        .toBe(true);
      if (!(await next.isEnabled())) break;
      await next.click();
    } while (true);
    expect(names.size).toBe(5);
    await salePanel(page, "Payment");
    await page
      .getByLabel("Sales type", { exact: true })
      .selectOption("partial");
    await page.getByLabel("Sales paid amount", { exact: true }).fill("100");
    await expect(
      page.getByLabel("Sales due amount", { exact: true }),
    ).toHaveValue("400.00");
    await assertFits();
    await page.getByRole("button", { name: "Add Note", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Sale Note", exact: true });
    await expect(dialog).toBeInViewport();
    await dialog
      .getByLabel("Sale notes", { exact: true })
      .fill("Optional delivery note");
    await dialog
      .getByRole("button", { name: "Save Note", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit Note", exact: true }),
    ).toBeInViewport();
  }
  expect(fixture.submittedSales).toHaveLength(0);
  expect(fixture.unhandled).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Confirm Sale saves the selected product directly and updates the dashboard", async ({
  page,
}) => {
  const fixture = await mockSalesWorkspace(page);
  await page.goto("/sales/new");
  await page
    .getByLabel("Select customer", { exact: true })
    .selectOption("existing-customer");
  await page
    .getByLabel("Sales product category", { exact: true })
    .first()
    .selectOption("parts");
  await page
    .getByLabel("Sales product", { exact: true })
    .first()
    .selectOption("part-one");
  await page.getByLabel("Sales quantity", { exact: true }).first().fill("3");
  await page
    .getByLabel("Unit sale price", { exact: true })
    .first()
    .fill("125.50");
  await expect(
    page.getByLabel("Sales paid amount", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Sales due amount", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Sales payment method", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".sales-cart-panel tbody tr")).toHaveCount(1);
  const confirm = page.getByRole("button", {
    name: "Confirm Sale",
    exact: true,
  });
  await expect(page.getByLabel("Sale notes", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add Note", exact: true }).click();
  const noteDialog = page.getByRole("dialog", {
    name: "Sale Note",
    exact: true,
  });
  await noteDialog
    .getByLabel("Sale notes", { exact: true })
    .fill("Handle with care");
  await noteDialog
    .getByRole("button", { name: "Save Note", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit Note", exact: true }).click();
  await expect(
    noteDialog.getByLabel("Sale notes", { exact: true }),
  ).toHaveValue("Handle with care");
  await noteDialog
    .getByLabel("Sale notes", { exact: true })
    .fill("Discard this edit");
  await noteDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await confirm.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByLabel("Sales quantity", { exact: true }).first(),
  ).toHaveValue("3");
  await confirm.click();
  await expect(page.locator(".sales-success")).toHaveText("বিক্রয় সফল হয়েছে");
  await expect(page.locator(".sales-success a")).toHaveCount(0);
  await salePanel(page, "Items");
  await expect(
    page.getByRole("table", { name: "Recent sales", exact: true }),
  ).toContainText("SALE-E2E-001");
  await page
    .getByRole("button", { name: "Sale Items (1)", exact: true })
    .click();
  const savedRow = page.locator(".sales-cart-panel tbody tr");
  await expect(savedRow).toContainText("Sale Test Auto Part");
  await expect(savedRow).toContainText("Standard");
  await expect(savedRow).toContainText("376.50");
  await expect(page.locator(".erp-summary-total")).toContainText("376.50");
  await expect(page.locator(".sales-cart-empty")).toHaveCount(0);
  expect(fixture.submittedSales).toHaveLength(2);
  expect(fixture.submittedSales[1].key).toBe(fixture.submittedSales[0].key);
  expect(fixture.submittedSales[1].body).toMatchObject({
    items: [{ productId: "part-one", quantity: 3, unitPrice: "125.50" }],
    paidAmount: "376.50",
    notes: "Handle with care",
  });
  await expect(confirm).toBeDisabled();
  await page.goto("/dashboard");
  const row = page.locator("tr").filter({ hasText: "SALE-E2E-001" });
  await expect(row).toContainText("Existing Customer");
  await expect(row).toContainText("376.50");
  await expect(row).not.toContainText("CONFIRMED");
  expect(fixture.unhandled).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("a sale uses saved customers, filtered stock, editable prices and a safe retry", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const mobile = info.project.name === "mobile";
  await page.setViewportSize({ width: mobile ? 390 : 1366, height: 650 });
  const fixture = await mockSalesWorkspace(page);
  await page.goto("/sales/new");
  const customer = page.getByLabel("Select customer", { exact: true });
  await expect(
    customer.locator('option[value="existing-customer"]'),
  ).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  const originalShell = await shellGeometry(page);
  await customer.selectOption("existing-customer");
  await expect(customer).toHaveValue("existing-customer");
  await page.getByRole("button", { name: "New Customer", exact: true }).click();
  const newCustomer = page.getByRole("dialog");
  await newCustomer
    .getByLabel("Customer name", { exact: true })
    .fill("Sales Created Customer");
  await page.mouse.click(2, 2);
  await expect(newCustomer).toBeVisible();
  await expect(
    newCustomer.getByLabel("Customer name", { exact: true }),
  ).toHaveValue("Sales Created Customer");
  await newCustomer
    .getByLabel("Customer mobile number", { exact: true })
    .fill("01800000002");
  await newCustomer
    .getByRole("button", { name: "Save Customer", exact: true })
    .click();
  await expect(newCustomer).toBeVisible();
  expect(fixture.submittedCustomers).toHaveLength(0);
  await expect(
    newCustomer.getByLabel("Customer address", { exact: true }),
  ).toHaveAttribute("required", "");
  await expect(
    newCustomer.getByLabel("Vehicle identifier (optional)", { exact: true }),
  ).toHaveCount(0);
  await newCustomer
    .getByLabel("Customer address", { exact: true })
    .fill("Barishal");
  await expect(
    newCustomer.getByLabel("Vehicle type (optional)", { exact: true }),
  ).toHaveCount(0);
  await newCustomer
    .getByRole("button", { name: "Save Customer", exact: true })
    .click();
  await expect(newCustomer).toHaveCount(0);
  await expect(customer).toHaveValue("created-customer");
  expect(fixture.submittedCustomers).toEqual([
    {
      name: "Sales Created Customer",
      phone: "01800000002",
      address: "Barishal",
    },
  ]);
  expect(await shellGeometry(page)).toEqual(originalShell);
  await expectNoHorizontalOverflow(page);

  if (mobile)
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .locator(mobile ? ".mobile-sidebar" : ".desktop-sidebar")
    .getByRole("link", { name: "Customers", exact: true })
    .click();
  await expect(page).toHaveURL("/customers");
  await expect(
    page.getByRole("button", { name: "Sales Created Customer", exact: true }),
  ).toBeVisible();
  expect(await shellGeometry(page)).toEqual(originalShell);
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole("button", { name: "Sales Created Customer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Customer Details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Vehicle", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".erp-details")
      .getByRole("link", { name: "New Sale", exact: true }),
  ).toHaveCount(0);
  // Existing customer deep links continue to work without a customer-panel shortcut.
  await page.goto("/sales/new?customer=created-customer");
  await expect(page).toHaveURL(/\/sales\/new\?customer=created-customer$/);
  await expect(customer).toHaveValue("created-customer");
  expect(await shellGeometry(page)).toEqual(originalShell);

  const category = page
    .getByLabel("Sales product category", { exact: true })
    .first();
  const product = page.getByLabel("Sales product", { exact: true }).first();
  const quantity = page.getByLabel("Sales quantity", { exact: true }).first();
  const price = page.getByLabel("Unit sale price", { exact: true }).first();
  const lineTotal = page
    .getByLabel("Sales line total", { exact: true })
    .first();
  const add = page.getByRole("button", {
    name: "Add Another Product",
    exact: true,
  });
  const itemRow = (name: string) =>
    page
      .getByRole("table", { name: "Sale items", exact: true })
      .locator("tbody tr")
      .filter({ hasText: name });
  await expect(product).toBeDisabled();
  await category.selectOption("parts");
  await expect(product.locator('option[value="part-one"]')).toHaveCount(1);
  await expect(product.locator('option[value="battery-one"]')).toHaveCount(0);
  await product.selectOption("part-one");
  await expect(price).toHaveValue("100.00");
  await quantity.fill("3");
  await price.fill("125.50");
  await expect
    .poll(async () =>
      Number((await lineTotal.inputValue()).replace(/[^0-9.-]/g, "")),
    )
    .toBe(376.5);
  await add.click();
  await salePanel(page, "Items");
  await expectCartProduct(page, "Sale Test Auto Part");
  await page
    .getByRole("button", { name: "Remove Sale Test Auto Part", exact: true })
    .click();
  await expect(itemRow("Sale Test Auto Part")).toHaveCount(0);
  await salePanel(page, "Details");
  await category.selectOption("parts");
  await product.selectOption("part-one");
  await quantity.fill("3");
  await price.fill("125.50");
  await add.click();
  await category.selectOption("empty-type");
  await expect(product).toBeDisabled();
  await expect(add).toBeEnabled();
  await category.selectOption("batteries");
  await expect(product.locator('option[value="part-one"]')).toHaveCount(0);
  await expect(product.locator('option[value="battery-one"]')).toHaveCount(1);
  await product.selectOption("battery-one");
  await quantity.fill("2");
  await expect(price).toHaveValue("1500.00");
  await expect(
    page.getByRole("button", { name: "Select Battery Units", exact: true }),
  ).toHaveCount(0);
  await add.click();
  // Every added row is required; remove the unused third row before posting.
  await page
    .getByRole("button", { name: "Remove product 3", exact: true })
    .click();
  await salePanel(page, "Items");
  await expectCartProduct(page, "Sale Test Battery");
  await salePanel(page, "Payment");
  const summary = (label: string) =>
    page
      .locator(".erp-summary-rows > div")
      .filter({ has: page.getByText(label, { exact: true }) });
  await expect(summary("Subtotal")).toContainText("3,376.50");
  const saleType = page.getByLabel("Sales type", { exact: true });
  const paid = page.getByLabel("Sales paid amount", { exact: true });
  await expect(saleType).toHaveValue("cash");
  await expect(paid).toHaveCount(0);
  await saleType.selectOption("credit");
  await expect(paid).toHaveCount(0);
  await expect(page.locator(".sales-due-hint")).toContainText("3,376.50");
  await saleType.selectOption("partial");
  await paid.fill("1500.00");
  await expect(
    page.getByLabel("Sales due amount", { exact: true }),
  ).toHaveValue("1876.50");
  await paid.fill("1000.00");
  await expect(paid).toHaveValue("1000.00");
  await expect(
    page.getByLabel("Sales due amount", { exact: true }),
  ).toHaveValue("2376.50");
  await expect(
    page.getByLabel("Sales due amount", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await expectNoHorizontalOverflow(page);
  const complete = page.getByRole("button", {
    name: "Confirm Sale",
    exact: true,
  });
  await complete.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sale service is temporarily unavailable.",
  );
  expect(fixture.submittedSales).toHaveLength(1);
  await expect(customer).toHaveValue("created-customer");
  await salePanel(page, "Items");
  await expectCartProduct(page, "Sale Test Auto Part");
  await expectCartProduct(page, "Sale Test Battery");
  await complete.click();
  await expect(page.locator(".sales-success")).toHaveText("বিক্রয় সফল হয়েছে");
  await expect(
    page.getByRole("table", { name: "Recent sales", exact: true }),
  ).toContainText("SALE-E2E-001");
  await page
    .getByRole("button", { name: "Sale Items (2)", exact: true })
    .click();
  await expectCartProduct(page, "Sale Test Auto Part");
  await expectCartProduct(page, "Sale Test Battery");
  await salePanel(page, "Payment");
  await expect(summary("Subtotal")).toContainText("3,376.50");
  await expect(paid).toHaveValue("1000.00");
  await expect(
    page.getByLabel("Sales due amount", { exact: true }),
  ).toHaveValue("2376.50");
  await salePanel(page, "Items");
  await expect(
    page.getByRole("button", { name: "Remove Sale Test Battery", exact: true }),
  ).toBeDisabled();
  await expect(complete).toBeDisabled();
  expect(fixture.submittedSales).toHaveLength(2);
  const [failed, successful] = fixture.submittedSales;
  expect(failed.key).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(successful.key).toBe(failed.key);
  expect(successful.csrf).toBe("sales-browser-csrf");
  expect(successful.body).toEqual(failed.body);
  expect(successful.body).toMatchObject({
    customerId: "created-customer",
    saleDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    items: [
      { productId: "part-one", quantity: 3, unitPrice: "125.50" },
      {
        productId: "battery-one",
        quantity: 2,
        unitPrice: "1500.00",
      },
    ],
    paidAmount: "1000.00",
    paymentAccountId: "cash-one",
  });
  await salePanel(page, "Details");
  await category.selectOption("parts");
  await product.selectOption("part-one");
  await quantity.fill("1");
  await expect(itemRow("Sale Test Auto Part")).toHaveCount(mobile ? 0 : 1);
  await expect(itemRow("Sale Test Battery")).toHaveCount(0);
  await expect(page.locator(".sales-success")).toHaveCount(0);
  await salePanel(page, "Payment");
  await expect(summary("Subtotal")).toContainText("100.00");
  await expect(complete).toBeEnabled();
  expect(fixture.submittedCustomers).toHaveLength(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await shellGeometry(page)).toEqual(originalShell);
  await expectNoHorizontalOverflow(page);
  expect(fixture.unhandled).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("multiple product-entry rows can be added, edited and removed before confirming one sale", async ({
  page,
}) => {
  const fixture = await mockSalesWorkspace(page);
  await page.goto("/sales/new");
  await page
    .getByLabel("Select customer", { exact: true })
    .selectOption("existing-customer");
  const add = page.getByRole("button", {
    name: "Add Another Product",
    exact: true,
  });
  const entry = (number: number) =>
    page.getByRole("group", { name: "Product " + number, exact: true });
  await expect(add).toBeEnabled();
  await add.click();
  await add.click();
  await expect(page.locator(".sales-product-entry")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Remove product 3", exact: true })
    .click();
  await expect(page.locator(".sales-product-entry")).toHaveCount(2);
  await entry(1)
    .getByLabel("Sales product category", { exact: true })
    .selectOption("parts");
  await entry(1)
    .getByLabel("Sales product", { exact: true })
    .selectOption("part-one");
  await entry(1).getByLabel("Sales quantity", { exact: true }).fill("2");
  await entry(1).getByLabel("Unit sale price", { exact: true }).fill("110.25");
  await entry(2)
    .getByLabel("Sales product category", { exact: true })
    .selectOption("parts");
  await entry(2)
    .getByLabel("Sales product", { exact: true })
    .selectOption("part-one");
  await entry(2).getByLabel("Sales quantity", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Confirm Sale", exact: true }).click();
  await expect(page.locator(".sales-error")).toContainText("already added");
  expect(fixture.submittedSales).toHaveLength(0);
  await entry(2)
    .getByLabel("Sales product category", { exact: true })
    .selectOption("batteries");
  await entry(2)
    .getByLabel("Sales product", { exact: true })
    .selectOption("battery-one");
  await entry(2).getByLabel("Sales quantity", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Remove product 1", exact: true })
    .click();
  await expect(
    entry(1).getByLabel("Sales product", { exact: true }),
  ).toHaveValue("battery-one");
  await expect(
    entry(1).getByLabel("Sales quantity", { exact: true }),
  ).toHaveValue("1");
  await add.click();
  await entry(2)
    .getByLabel("Sales product category", { exact: true })
    .selectOption("parts");
  await entry(2)
    .getByLabel("Sales product", { exact: true })
    .selectOption("part-one");
  await entry(2).getByLabel("Sales quantity", { exact: true }).fill("2");
  await entry(2).getByLabel("Unit sale price", { exact: true }).fill("110.25");
  await salePanel(page, "Payment");
  await expect(page.locator(".erp-summary-total")).toContainText("1,720.50");
  await page.getByRole("button", { name: "Confirm Sale", exact: true }).click();
  await expect(page.locator(".sales-error")).toContainText(
    "temporarily unavailable",
  );
  await page.getByRole("button", { name: "Confirm Sale", exact: true }).click();
  await expect(page.locator(".sales-success")).toBeVisible();
  expect(fixture.submittedSales).toHaveLength(2);
  expect(fixture.submittedSales[1].body.items).toEqual([
    { productId: "battery-one", quantity: 1, unitPrice: "1500.00" },
    { productId: "part-one", quantity: 2, unitPrice: "110.25" },
  ]);
  expect(fixture.submittedSales[1].body.paidAmount).toBe("1720.50");
  expect(fixture.submittedSales[1].key).toBe(fixture.submittedSales[0].key);
  expect(fixture.errors).toEqual([]);
});
