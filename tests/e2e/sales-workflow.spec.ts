import { test, expect, type Page } from "@playwright/test";
import type {
  CurrentUser,
  CustomerRecord,
  SalesOptions,
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
  vehicles: [],
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

async function mockSalesWorkspace(page: Page) {
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
        units: [],
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
        units: [
          {
            id: "battery-unit-one",
            serialNumber: "SALE-SERIAL-001",
            productionDate: null,
          },
          {
            id: "battery-unit-two",
            serialNumber: "SALE-SERIAL-002",
            productionDate: "2026-10-01",
          },
        ],
      },
    ],
    customers,
    paymentAccounts: [
      { id: "cash-one", name: "Cash Counter", paymentMethod: "CASH" },
    ],
  };
  const submittedCustomers: Record<string, unknown>[] = [];
  const submittedSales: { body: SubmittedSale; key: string; csrf: string }[] =
    [];
  const unhandled: string[] = [];
  const errors: string[] = [];
  let failCompletion = true;
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
              suppliers: 0,
              availableStock: "12",
              pendingReplacements: 0,
              sentToCompany: 0,
              replacementsReceived: 0,
              lowStock: 0,
            },
            recentSales: [],
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
        vehicles: body.vehicleType
          ? [
              {
                id: "created-vehicle",
                type: body.vehicleType,
                identifier: body.vehicleIdentifier || null,
              },
            ]
          : [],
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
  return { submittedCustomers, submittedSales, unhandled, errors };
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
  await newCustomer
    .getByLabel("Customer mobile number", { exact: true })
    .fill("01800000002");
  await newCustomer
    .getByLabel("Customer address (optional)", { exact: true })
    .fill("Barishal");
  await newCustomer
    .getByLabel("Vehicle type (optional)", { exact: true })
    .fill("Easy Bike");
  await newCustomer
    .getByLabel("Vehicle identifier (optional)", { exact: true })
    .fill("DHAKA-E2E-01");
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
      vehicleType: "Easy Bike",
      vehicleIdentifier: "DHAKA-E2E-01",
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
  await page
    .locator(".erp-details")
    .getByRole("link", { name: "New Sale", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sales\/new\?customer=created-customer$/);
  await expect(customer).toHaveValue("created-customer");
  expect(await shellGeometry(page)).toEqual(originalShell);

  const category = page.getByLabel("Sales product category", { exact: true });
  const product = page.getByLabel("Sales product", { exact: true });
  const quantity = page.getByLabel("Sales quantity", { exact: true });
  const price = page.getByLabel("Unit sale price", { exact: true });
  const lineTotal = page.getByLabel("Sales line total", { exact: true });
  const add = page.getByRole("button", { name: "Add to Sale", exact: true });
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
  await expect(itemRow("Sale Test Auto Part")).toBeVisible();
  await page
    .getByRole("button", { name: "Remove Sale Test Auto Part", exact: true })
    .click();
  await expect(itemRow("Sale Test Auto Part")).toHaveCount(0);
  await category.selectOption("parts");
  await product.selectOption("part-one");
  await quantity.fill("3");
  await price.fill("125.50");
  await add.click();
  await category.selectOption("empty-type");
  await expect(product).toBeDisabled();
  await expect(add).toBeDisabled();
  await category.selectOption("batteries");
  await expect(product.locator('option[value="part-one"]')).toHaveCount(0);
  await expect(product.locator('option[value="battery-one"]')).toHaveCount(1);
  await product.selectOption("battery-one");
  await quantity.fill("2");
  await expect(price).toHaveValue("1500.00");
  await page
    .getByRole("button", { name: "Select Battery Units", exact: true })
    .click();
  const units = page.getByRole("group", {
    name: "Sale battery units",
    exact: true,
  });
  await expect(units.getByRole("checkbox")).toHaveCount(2);
  await units.getByRole("checkbox", { name: /SALE-SERIAL-001/ }).check();
  await units.getByRole("checkbox", { name: /SALE-SERIAL-002/ }).check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await add.click();
  await expect(itemRow("Sale Test Battery")).toBeVisible();
  const summary = (label: string) =>
    page
      .locator(".erp-summary-rows > div")
      .filter({ has: page.getByText(label, { exact: true }) });
  await expect(summary("Subtotal")).toContainText("3,376.50");
  const saleType = page.getByLabel("Sales type", { exact: true });
  const paid = page.getByLabel("Sales paid amount", { exact: true });
  await expect(saleType).toHaveValue("cash");
  await expect(paid).toHaveValue("3376.50");
  await saleType.selectOption("credit");
  await paid.fill("1000.00");
  await page
    .getByLabel("Sales payment method", { exact: true })
    .selectOption("cash-one");
  await expect(paid).toHaveValue("1000.00");
  await expect(page.locator(".sales-due")).toContainText("2,376.50");
  await expectNoHorizontalOverflow(page);
  const complete = page.getByRole("button", {
    name: "Complete Sale",
    exact: true,
  });
  await complete.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sale service is temporarily unavailable.",
  );
  expect(fixture.submittedSales).toHaveLength(1);
  await expect(customer).toHaveValue("created-customer");
  await expect(itemRow("Sale Test Auto Part")).toBeVisible();
  await expect(itemRow("Sale Test Battery")).toBeVisible();
  await complete.click();
  await expect(page.getByText(/SALE-E2E-001/).first()).toBeVisible();
  await expect(itemRow("Sale Test Auto Part")).toHaveCount(0);
  await expect(itemRow("Sale Test Battery")).toHaveCount(0);
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
        batteryUnitIds: ["battery-unit-one", "battery-unit-two"],
      },
    ],
    paidAmount: "1000.00",
    paymentAccountId: "cash-one",
  });
  expect(fixture.submittedCustomers).toHaveLength(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await shellGeometry(page)).toEqual(originalShell);
  await expectNoHorizontalOverflow(page);
  expect(fixture.unhandled).toEqual([]);
  expect(fixture.errors).toEqual([]);
});
