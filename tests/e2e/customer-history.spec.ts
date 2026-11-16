import { test, expect } from "@playwright/test";

test("View Details organizes the selected customer's sales by dated invoice and supports paging, retry and empty history", async ({
  page,
}) => {
  const customers = [
    {
      id: "customer-1",
      name: "Customer One",
      phone: "01700000001",
      address: "Dhaka",
      active: true,
      createdAt: "2026-11-01",
      vehicles: [],
      totalSales: "500",
      due: "100",
    },
    {
      id: "customer-2",
      name: "Customer Two",
      phone: "01700000002",
      address: "Khulna",
      active: true,
      createdAt: "2026-11-02",
      vehicles: [],
      totalSales: "0",
      due: "0",
    },
  ];
  let fail = true;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          data: {
            id: "owner",
            name: "Owner",
            login: "owner",
            roles: ["OWNER"],
            permissions: [
              "dashboard.read",
              "parties.customers",
              "sales.manage",
            ],
          },
        },
      });
    if (url.pathname.includes("/modules/"))
      return route.fulfill({ json: { data: {} } });
    if (url.pathname.endsWith("/customers"))
      return route.fulfill({
        json: {
          data: {
            items: customers,
            total: 2,
            page: 1,
            pageSize: 10,
            summary: {},
          },
        },
      });
    if (url.pathname.endsWith("/sales")) {
      const customer = url.pathname.includes("customer-1")
        ? customers[0]
        : customers[1];
      if (customer.id === "customer-1" && fail) {
        return route.fulfill({
          status: 503,
          json: { error: { message: "History temporarily unavailable" } },
        });
      }
      const pageNumber = Number(url.searchParams.get("page"));
      return route.fulfill({
        json: {
          data: {
            customer,
            total: customer.id === "customer-1" ? 11 : 0,
            page: pageNumber,
            pageSize: 10,
            items:
              customer.id === "customer-1"
                ? [
                    {
                      id: `sale-${pageNumber}`,
                      invoiceNumber: `HWB-00000${pageNumber}`,
                      soldAt:
                        pageNumber === 1
                          ? "2026-11-16T19:00:00Z"
                          : "2026-11-10T09:00:00Z",
                      status: "CONFIRMED",
                      subtotal: "275",
                      discount: "25",
                      total: "250",
                      products: [
                        {
                          id: "line-1",
                          name:
                            pageNumber === 1 ? "Auto Life" : "Earlier Battery",
                          model: "MODEL-100",
                          quantity: "2",
                          unit: "piece",
                          unitPrice: "100",
                          amount: "200",
                        },
                        {
                          id: "line-2",
                          name: "Battery Cable",
                          model: "CABLE-1",
                          quantity: "3",
                          unit: "piece",
                          unitPrice: "25",
                          amount: "75",
                        },
                      ],
                    },
                  ]
                : [],
          },
        },
      });
    }
    return route.abort();
  });
  await page.goto("/customers");
  const first = page
    .getByRole("row")
    .filter({ hasText: "Customer One" })
    .getByRole("button", { name: "View Details", exact: true });
  await first.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Customer Details — Customer One" }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(
    "History temporarily unavailable",
  );
  fail = false;
  await dialog.getByRole("button", { name: "Retry" }).click();
  await expect(
    dialog.getByRole("heading", { name: "HWB-000001" }),
  ).toBeVisible();
  await expect(dialog.locator("time")).toHaveText("17 Nov 2026");
  await expect(
    dialog.getByRole("cell", { name: "Auto Life", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("cell", { name: "Battery Cable", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("cell", { name: "2 piece", exact: true }),
  ).toBeVisible();
  await expect(
    dialog
      .getByRole("row")
      .filter({ hasText: "Invoice Total:" })
      .getByRole("cell", { name: "৳250.00", exact: true }),
  ).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: test.info().outputPath("customer-details.png"),
  });
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "HWB-000002" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Earlier Battery", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(first).toBeFocused();
  await page
    .getByRole("row")
    .filter({ hasText: "Customer Two" })
    .getByRole("button", { name: "View Details", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Customer Details — Customer Two" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("No sales recorded for this customer."),
  ).toBeVisible();
  await expect(dialog.getByText("Auto Life", { exact: true })).toHaveCount(0);
});
