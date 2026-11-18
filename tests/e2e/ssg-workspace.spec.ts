import { test, expect, type Route } from "@playwright/test";

test("static workspace layouts are HTML with JavaScript disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) requests.push(request.url());
  });
  for (const route of [
    "/dashboard",
    "/inventory",
    "/purchases/new",
    "/purchases/list",
    "/sales/new",
    "/sales/list",
    "/sales/returns",
    "/sales/collections",
    "/replacements/list",
    "/replacements/new",
    "/replacements/policy",
    "/customers/list",
    "/customers/new",
    "/suppliers/list",
    "/suppliers/new",
    "/accounts/summary",
    "/accounts/reports",
    "/users",
    "/recycle-bin",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator(".desktop-sidebar .brand")).toHaveCount(1);
    await expect(page.locator(".top-header h1")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator(".workspace-content")).toHaveAttribute(
      "inert",
      "",
    );
    expect(await page.getByRole("main").innerText()).not.toContain(
      "Opening workspace",
    );
    expect(await page.getByRole("main").innerText()).not.toContain(
      "Loading workspace",
    );
    if (route === "/inventory") {
      await expect(
        page.getByText("Product Category", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Model Number", exact: true }),
      ).toBeVisible();
    }
    if (route === "/purchases/new")
      await expect(page.getByLabel("Purchase supplier")).toBeVisible();
    if (route === "/suppliers/list")
      await expect(
        page.getByRole("table", { name: "Suppliers", exact: true }),
      ).toBeVisible();
    if (route === "/recycle-bin")
      await expect(
        page.getByRole("table", { name: "Deleted items", exact: true }),
      ).toBeVisible();
  }
  expect(requests).toEqual([]);
  await context.close();
});

test("static UI appears before authentication and business reads wait", async ({
  page,
}) => {
  let session: Route | undefined;
  let authenticated = false;
  const premature: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === "/auth/me") {
      session = route;
      return;
    }
    if (!authenticated) premature.push(path);
    if (path.startsWith("/modules/"))
      return data({ status: "FOUNDATION_ONLY" });
    if (path === "/catalog")
      return data({
        types: [
          {
            id: "live-type",
            name: "LIVE_DATABASE_CATEGORY",
            trackingKind: "BULK",
            productCount: 0,
          },
        ],
        categories: [],
        brands: [],
        totalProducts: 0,
      });
    if (path === "/products")
      return data({ items: [], total: 0, page: 1, pageSize: 10 });
    return route.abort();
  });
  await page.goto("/inventory");
  await expect.poll(() => Boolean(session)).toBe(true);
  await expect(
    page.getByText("Product Category", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Model Number", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-content")).toHaveAttribute("inert", "");
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeDisabled();
  expect(premature).toEqual([]);
  const html = await (await page.request.get("/inventory")).text();
  expect(html).not.toContain("LIVE_DATABASE_CATEGORY");
  expect(html).not.toContain("LIVE_DATABASE_OWNER");
  authenticated = true;
  await session!.fulfill({
    json: {
      data: {
        id: "live-owner",
        login: "owner",
        name: "LIVE_DATABASE_OWNER",
        roles: ["OWNER"],
        permissions: ["inventory.read", "catalog.read"],
      },
    },
  });
  await expect(
    page.getByRole("button", { name: "LIVE_DATABASE_CATEGORY 0", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-content")).not.toHaveAttribute("inert");
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
