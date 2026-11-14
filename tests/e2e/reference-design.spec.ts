import { test, expect } from "@playwright/test";

test("reference layouts fit desktop and mobile and draft actions do not write records", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1670, height: 940 });
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  for (const [module, title] of [
    ["dashboard", "Dashboard"],
    ["products", "Inventory / Stock"],
    ["purchases", "Purchase"],
    ["inventory", "Inventory / Stock"],
    ["replacements", "Replacement / Warranty"],
    ["sales", "Sales"],
    ["customers", "Customers"],
    ["accounts", "Accounts & Expenses"],
  ]) {
    await page.goto(
      module === "dashboard" ? "/preview" : `/preview?module=${module}`,
    );
    await expect(
      page.getByRole("heading", { name: title, exact: true, level: 1 }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      module + " horizontal overflow",
    ).toBe(true);
    await page.screenshot({
      path: `test-results/reference-${module}-${info.project.name}.png`,
      fullPage: true,
    });
    if (module === "products") {
      await expect(
        page.getByRole("button", { name: "Add Product", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Product category actions", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Add Product Category", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page
          .getByRole("dialog")
          .getByText(
            "Preview only: sign in to save product categories and products.",
            { exact: true },
          ),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Close product category dialog" })
        .click();
    }
  }
  await page.goto("/preview?module=inventory&view=new");
  await expect(page).toHaveURL("/preview?module=inventory");
  await expect(
    page.getByRole("button", { name: "Add Product", exact: true }),
  ).toHaveCount(0);
  await page.goto("/preview?module=purchases");
  await page.getByRole("button", { name: "New Product", exact: true }).click();
  const productDialog = page.getByRole("dialog", {
    name: "New Purchase Product",
    exact: true,
  });
  await expect(
    productDialog.getByRole("button", { name: "Save Product", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Close purchase product dialog", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Receive & Confirm", exact: true }),
  ).toBeDisabled();
  await page.goto("/preview?module=sales");
  await expect(
    page.getByRole("button", { name: "Complete Sale", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "New Customer", exact: true }).click();
  const customerDialog = page.getByRole("dialog", {
    name: "New Customer",
    exact: true,
  });
  await expect(
    customerDialog.getByRole("button", { name: "Save Customer", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Close customer dialog", exact: true })
    .click();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("purchase controls fit short viewports without page scrolling or clipped panels", async ({
  page,
}, info) => {
  const sizes =
    info.project.name === "mobile"
      ? [
          [390, 844],
          [390, 650],
          [360, 640],
        ]
      : [
          [1920, 910],
          [1366, 768],
          [1366, 650],
          [1024, 650],
          [768, 650],
        ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto("/preview?module=purchases");
    const save = page.getByRole("button", {
      name: "Receive & Confirm",
      exact: true,
    });
    await expect(save).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(save).toBeInViewport();
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      panels: [
        ...document.querySelectorAll(
          ".purchase-details,.purchase-items,.erp-form-side,.erp-form-side>.erp-panel,.erp-form-grid",
        ),
      ].map((panel) => ({
        label: panel.className,
        height: panel.clientHeight,
        scroll: panel.scrollHeight,
      })),
    }));
    expect(metrics.width).toBeLessThanOrEqual(width);
    expect(metrics.height).toBeLessThanOrEqual(height);
    for (const panel of metrics.panels)
      expect(panel.scroll, panel.label).toBeLessThanOrEqual(panel.height + 1);
    if (width < 768) {
      await page
        .getByRole("navigation", { name: "Purchase sections" })
        .getByRole("button", { name: "Payment", exact: true })
        .click();
      await expect(
        page.getByLabel("Payment Type", { exact: true }),
      ).toBeInViewport();
    }
    await page.getByRole("button", { name: "Add Note", exact: true }).click();
    const notes = page.getByRole("dialog", {
      name: "Purchase Notes",
      exact: true,
    });
    await notes
      .getByLabel("Purchase notes", { exact: true })
      .fill("Viewport verification note");
    await notes.getByRole("button", { name: "Done", exact: true }).click();
    await expect(save).toBeInViewport();
  }
});
