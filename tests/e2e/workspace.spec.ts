import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

function credentials() {
  if (process.env.ERP_E2E_PASSWORD)
    return {
      login: process.env.ERP_E2E_LOGIN ?? "owner",
      password: process.env.ERP_E2E_PASSWORD,
    };
  const text = readFileSync(".local/admin-credentials.txt", "utf8");
  const login = text.match(/^Login: (.+)$/m)?.[1];
  const password = text.match(/^Password: (.+)$/m)?.[1];
  if (!login || !password)
    throw new Error(
      "Create local admin credentials or set ERP_E2E_LOGIN/ERP_E2E_PASSWORD.",
    );
  return { login, password };
}

test("expired sessions leave the workspace and allow signing in again", async ({
  page,
  context,
}, info) => {
  const account = credentials();
  await page.goto("/login");
  await page.getByLabel("Login", { exact: true }).fill(account.login);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText("No invoices yet", { exact: true }),
  ).toBeVisible();

  // Keep the mounted workspace open while invalidating its authentication cookie.
  await context.clearCookies();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Suppliers", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(
    0,
  );

  await page.getByLabel("Login", { exact: true }).fill(account.login);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/suppliers");
  await expect(
    page.getByRole("heading", { name: "Suppliers", level: 1, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Please sign in.", { exact: true })).toHaveCount(
    0,
  );
});

test("invalid passwords and permission denials keep their own error messages", async ({
  page,
}, info) => {
  const account = credentials();
  await page.goto("/login");
  // Exercise the browser's 401 handling without consuming a failed-login attempt.
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: { error: { message: "Invalid login or password." } },
    }),
  );
  await page.getByLabel("Login", { exact: true }).fill(account.login);
  await page
    .getByLabel("Password", { exact: true })
    .fill(account.password + "-incorrect");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Invalid login or password.",
  );
  await expect(page).toHaveURL(/\/login$/);

  await page.unroute("**/api/v1/auth/login");
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.route("**/api/v1/modules/suppliers", (route) =>
    route.fulfill({
      status: 403,
      json: {
        error: {
          message: "You do not have permission to access this resource.",
        },
      },
    }),
  );
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Suppliers", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "You do not have permission to access this resource.",
  );
  await expect(page).toHaveURL(/\/suppliers$/);
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeVisible();
});

test("preview is responsive, clearly labeled, and contains no fabricated financial values", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/preview");
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("UI preview", { exact: true })).toBeVisible();
  await expect(page.getByText("৳12,000")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Inventory / Stock", exact: true })
      .click();
  } else
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Inventory / Stock", exact: true })
      .click();
  await expect(
    page.getByRole("heading", {
      name: "Inventory / Stock",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No records to display", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("login reaches the real empty dashboard, module routes work, and sign out revokes access", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const account = credentials();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Login", { exact: true }).fill(account.login);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("No invoices yet", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("৳0.00", { exact: true }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  for (const [route, heading] of [
    ["products", "Inventory / Stock"],
    ["purchases", "Purchase"],
    ["inventory", "Inventory / Stock"],
    ["sales/new", "Sales"],
    ["replacements", "Replacement / Warranty"],
    ["customers", "Customers"],
    ["suppliers", "Suppliers"],
    ["accounts", "Accounts & Expenses"],
    ["settings", "Settings"],
    ["users", "Users & Permissions"],
  ]) {
    await page.goto("/" + route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("cell", { name: account.login, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page
    .getByRole("menuitem", { name: "Sign out", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  const response = await page.request.get("/api/v1/auth/me");
  expect(response.status()).toBe(401);
  expect(errors).toEqual([]);
});
