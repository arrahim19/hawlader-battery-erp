import { test, expect } from "@playwright/test";

for (const [kind, view] of [
  ["sales", "new"],
  ["sales", "list"],
  ["purchases", "new"],
] as const) {
  test(`${kind} ${view} deletion requires confirmation, keeps failed rows, and reloads after success`, async ({
    page,
  }, info) => {
    const label = kind === "sales" ? "HWB-000001" : "PUR-TEST";
    const calls: object[] = [];
    const errors: string[] = [];
    let exists = true;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace("/api/v1", "");
      if (path === "/auth/me")
        return route.fulfill({
          json: {
            data: {
              id: "owner",
              login: "owner",
              name: "Owner",
              roles: ["OWNER"],
              permissions: [
                "sales.manage",
                "purchases.manage",
                "transactions.reverse",
                "finance.write",
              ],
            },
          },
        });
      if (path === "/auth/csrf")
        return route.fulfill({ json: { data: { token: "csrf-test" } } });
      if (path.startsWith("/modules/"))
        return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
      if (path === "/sales/options" || path === "/purchases/options")
        return route.fulfill({
          json: {
            data: {
              types: [{ id: "parts", name: "Parts", trackingKind: "QUANTITY" }],
              products: [
                {
                  id: "draft-product",
                  name: "Draft Product",
                  model: "Model",
                  unit: "pcs",
                  type: {
                    id: "parts",
                    name: "Parts",
                    trackingKind: "QUANTITY",
                  },
                  defaultSellingPrice: "100.00",
                  availableQuantity: "10",
                },
              ],
              customers: [
                {
                  id: "customer",
                  name: "Customer",
                  phone: "01700000000",
                  address: "Dhaka",
                  active: true,

                  due: "0.00",
                  totalSales: "0.00",
                },
              ],
              suppliers: [],
              productNames: [],
              paymentAccounts: [
                { id: "cash", name: "Cash", paymentMethod: "CASH" },
              ],
            },
          },
        });
      if (path === `/${kind}/record` && request.method() === "DELETE") {
        expect(request.headers()["x-csrf-token"]).toBe("csrf-test");
        calls.push(request.postDataJSON());
        if (calls.length === 1)
          return route.fulfill({
            status: 409,
            json: {
              error: { message: "This transaction has a dependent record." },
            },
          });
        exists = false;
        return route.fulfill({
          json: { data: { id: "record", status: "CANCELLED" } },
        });
      }
      if (path === "/sales")
        return route.fulfill({
          json: {
            data: {
              items: exists
                ? [
                    {
                      id: "record",
                      invoiceNumber: label,
                      customer: {
                        id: "customer",
                        name: "Customer",
                        phone: "01700000000",
                      },
                      saleDate: "2026-11-16",
                      status: "CONFIRMED",
                      subtotal: "100.00",
                      total: "100.00",
                      paid: "50.00",
                      due: "50.00",
                      quantity: "1",
                      itemCount: 1,
                    },
                  ]
                : [],
              total: exists ? 1 : 0,
              page: Number(url.searchParams.get("page")),
              pageSize: Number(url.searchParams.get("pageSize")),
            },
          },
        });
      if (path === "/purchases/recent")
        return route.fulfill({
          json: {
            data: {
              items: exists
                ? [
                    {
                      id: "record",
                      number: label,
                      purchaseDate: "2026-11-16",
                      supplierReference: "Challan",
                      supplier: { name: "Supplier", company: "Company" },
                      items: [
                        {
                          id: "item",
                          name: "Product",
                          typeName: "Parts",
                          model: "Model",
                          quantity: "1",
                          unitPrice: "100.00",
                          total: "100.00",
                          warrantyMonths: 0,
                        },
                      ],
                    },
                  ]
                : [],
            },
          },
        });
      errors.push("Unhandled " + request.method() + " " + path);
      return route.abort();
    });
    await page.goto("/" + kind + (view === "list" ? "/list" : ""));
    if (view === "list") {
      await expect(
        page.getByRole("heading", { name: "Sales List", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Status", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Details", exact: true }),
      ).toBeVisible();
    } else
      await expect(
        page.getByRole("button", {
          name: "Confirm " + (kind === "sales" ? "Sale" : "Purchase"),
          exact: true,
        }),
      ).toBeVisible();
    if (kind === "sales" && view !== "list") {
      await page
        .getByLabel("Select customer", { exact: true })
        .selectOption("customer");
      await page
        .getByLabel("Sales product category", { exact: true })
        .selectOption("parts");
      await page
        .getByLabel("Sales product", { exact: true })
        .selectOption("draft-product");
      await page.getByLabel("Sales quantity", { exact: true }).fill("2");
    }
    if (info.project.name === "mobile" && view !== "list") {
      if (kind === "sales")
        await page
          .getByRole("navigation", { name: "Sale panels" })
          .getByRole("button", { name: "Items / Sales", exact: true })
          .click();
      else
        await page
          .getByRole("button", { name: "Recent Purchases", exact: true })
          .click();
    }
    if (kind === "sales" && view !== "list")
      await page
        .getByRole("button", { name: "Recent Sales", exact: true })
        .click();
    const trigger = page.getByRole("button", {
      name: "Delete " + label,
      exact: true,
    });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("alertdialog");
    const submit = dialog.getByRole("button", {
      name: kind === "sales" ? "Delete Sale" : "Delete Purchase",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(calls).toHaveLength(0);
    await trigger.click();
    await expect(dialog.locator("textarea")).toHaveCount(0);
    await expect(submit).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await submit.click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "This transaction has a dependent record.",
    );
    await expect(dialog).toBeVisible();
    await expect(
      page.locator(`button[aria-label="Delete ${label}"]`),
    ).toHaveCount(1);
    await submit.click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toHaveCount(0);
    if (kind === "sales" && view !== "list") {
      if (info.project.name === "mobile")
        await page
          .getByRole("navigation", { name: "Sale panels" })
          .getByRole("button", { name: "Details", exact: true })
          .click();
      await expect(
        page.getByLabel("Sales quantity", { exact: true }),
      ).toHaveValue("2");
      await expect(
        page.getByLabel("Sales product", { exact: true }),
      ).toHaveValue("draft-product");
    }
    expect(calls).toEqual([{ confirmed: true }, { confirmed: true }]);
    expect(errors).toEqual([]);
  });
}
