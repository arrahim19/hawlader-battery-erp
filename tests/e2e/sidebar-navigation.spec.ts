import { test, expect, type Page } from "@playwright/test";
import type { CurrentUser, DashboardData } from "../../packages/api-client/src";

const owner: CurrentUser = {
  id: "sidebar-layout-owner",
  name: "Sidebar Layout Owner",
  login: "sidebar-layout-owner",
  roles: ["OWNER"],
  permissions: [
    "dashboard.read",
    "purchases.manage",
    "inventory.read",
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
const dashboard: DashboardData = {
  businessDate: "2026-11-13",
  from: "2026-11-13",
  to: "2026-11-13",
  counts: {
    products: 0,
    customers: 0,
    suppliers: 0,
    availableStock: "0",
    pendingReplacements: 0,
    sentToCompany: 0,
    replacementsReceived: 0,
    lowStock: 0,
  },
  recentSales: [],
  lowStock: [],
  salesTrend: [],
};

async function mockWorkspace(page: Page) {
  const writes: string[] = [];
  const unhandled: string[] = [];
  const errors: string[] = [];
  let delayedModule = "";
  let release: (() => void) | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  // All business requests stay inside this read-only browser fixture.
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    if (request.method() !== "GET") {
      writes.push(path);
      return route.abort();
    }
    if (path === "/auth/me") return route.fulfill({ json: { data: owner } });
    if (path.startsWith("/modules/")) {
      if (path === "/modules/" + delayedModule)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return route.fulfill({ json: { data: { status: "FOUNDATION_ONLY" } } });
    }
    if (path === "/dashboard")
      return route.fulfill({ json: { data: dashboard } });
    if (path === "/purchases/options")
      return route.fulfill({
        json: {
          data: { suppliers: [], types: [], products: [], paymentAccounts: [] },
        },
      });
    if (path === "/sales/options")
      return route.fulfill({
        json: {
          data: { types: [], products: [], customers: [], paymentAccounts: [] },
        },
      });
    if (path === "/purchases" || path === "/products" || path === "/sales")
      return route.fulfill({
        json: {
          data: {
            items: [],
            total: 0,
            page: Number(url.searchParams.get("page") ?? 1),
            pageSize: Number(url.searchParams.get("pageSize") ?? 20),
          },
        },
      });
    if (path === "/catalog")
      return route.fulfill({
        json: {
          data: { types: [], brands: [], categories: [], totalProducts: 0 },
        },
      });
    unhandled.push(path);
    return route.abort();
  });
  return {
    writes,
    unhandled,
    errors,
    delayModule(name: string) {
      delayedModule = name;
      release = undefined;
    },
    get blocked() {
      return Boolean(release);
    },
    releaseModule() {
      delayedModule = "";
      release?.();
    },
  };
}

const headerSelectors = [
  ".top-header",
  ".header-controls",
  ".header-date",
  ".notification-button",
  ".account-trigger",
  ".header-avatar",
  ".desktop-menu-button",
  ".mobile-menu-button",
];

async function geometry(page: Page, sidebar: string) {
  return page.evaluate(
    ({ sidebar, headerSelectors }) => {
      const selectors = [
        sidebar,
        ...[
          ".brand",
          ".brand-icon",
          ".brand strong",
          ".brand small",
          ".sidebar-nav",
          ".nav-row",
          ".nav-item",
          ".nav-item > svg",
          ".nav-toggle",
          ".nav-children",
          ".nav-child",
          ".nav-child > svg",
          ".sidebar-bottom",
          ".shop-card",
        ].map((selector) => sidebar + " " + selector),
        ...headerSelectors,
      ];
      return selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector), (node) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { selector, x, y, width, height };
        }),
      );
    },
    { sidebar, headerSelectors },
  );
}

// Watch every animation frame so a final stable frame cannot hide a route flash.
async function monitorDesktop(page: Page) {
  await page.evaluate((headerSelectors) => {
    const scope = window as typeof window & {
      __sidebarLayoutMonitor?: { stopped: boolean; failures: string[] };
    };
    const selectors = [
      ".desktop-sidebar",
      ".desktop-sidebar .brand",
      ".desktop-sidebar .brand-icon",
      ".desktop-sidebar .sidebar-nav",
      ".desktop-sidebar .nav-row",
      ".desktop-sidebar .nav-item",
      ".desktop-sidebar .nav-item > svg",
      ".desktop-sidebar .nav-children",
      ".desktop-sidebar .nav-child",
      ".desktop-sidebar .nav-child > svg",
      ".desktop-sidebar .sidebar-bottom",
      ...headerSelectors,
    ];
    const rect = (node: Element) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return JSON.stringify({ x, y, width, height });
    };
    const nodes = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector), (node) => ({
        node,
        selector,
        original: rect(node),
      })),
    );
    const nav = document.querySelector(".desktop-sidebar .sidebar-nav")!;
    const scrollTop = nav.scrollTop;
    const monitor = { stopped: false, failures: [] as string[] };
    scope.__sidebarLayoutMonitor = monitor;
    function sample() {
      if (monitor.stopped) return;
      for (const { node, selector, original } of nodes) {
        if (!node.isConnected || rect(node) !== original) {
          if (monitor.failures.length < 20)
            monitor.failures.push(selector + " changed during navigation");
          break;
        }
      }
      if (nav.scrollTop !== scrollTop && monitor.failures.length < 20)
        monitor.failures.push("Sidebar scroll position changed");
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, headerSelectors);
}

async function stopMonitor(page: Page) {
  return page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const scope = window as typeof window & {
      __sidebarLayoutMonitor?: { stopped: boolean; failures: string[] };
    };
    const monitor = scope.__sidebarLayoutMonitor!;
    monitor.stopped = true;
    return monitor.failures;
  });
}

test("sidebar and top bar keep their geometry throughout desktop navigation", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop sidebar coverage");
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1366, height: 650 });
  const fixture = await mockWorkspace(page);
  await page.goto("/dashboard");
  const sidebar = page.locator(".desktop-sidebar");
  await expect(
    sidebar.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => document.fonts.ready);
  await expect(sidebar.locator(".nav-child")).toHaveCount(0);
  await expect(sidebar.locator(".nav-toggle")).toHaveCount(0);
  const original = await geometry(page, ".desktop-sidebar");
  await monitorDesktop(page);
  for (const href of ["/purchases"]) {
    await sidebar.locator(`a[href="${href}"]`).click();
    await expect(page).toHaveURL(href);
    if (href === "/purchases")
      await expect(page.getByLabel("Purchase supplier")).toBeEnabled();
    else
      await expect(
        page.getByText("No records to display", { exact: true }),
      ).toBeVisible();
    expect(await geometry(page, ".desktop-sidebar")).toEqual(original);
  }
  fixture.delayModule("inventory");
  await sidebar
    .getByRole("link", { name: "Inventory / Stock", exact: true })
    .click();
  await expect(page).toHaveURL("/inventory");
  await expect.poll(() => fixture.blocked).toBe(true);
  await expect(
    page.getByLabel("Loading module", { exact: true }),
  ).toBeVisible();
  expect(await geometry(page, ".desktop-sidebar")).toEqual(original);
  fixture.releaseModule();
  await expect(page.getByLabel("Loading module", { exact: true })).toHaveCount(
    0,
  );
  for (const href of ["/sales", "/dashboard"]) {
    await sidebar.locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL(href);
    expect(await geometry(page, ".desktop-sidebar")).toEqual(original);
  }
  await page.goBack();
  await expect(page).toHaveURL("/sales");
  expect(await geometry(page, ".desktop-sidebar")).toEqual(original);
  await page.goForward();
  await expect(page).toHaveURL("/dashboard");
  expect(await geometry(page, ".desktop-sidebar")).toEqual(original);
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await geometry(page, ".desktop-sidebar")).toEqual(original);
  await page
    .getByRole("button", { name: "Close notifications", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  expect(await geometry(page, ".desktop-sidebar")).toEqual(original);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await stopMonitor(page)).toEqual([]);

  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await expect(sidebar).toHaveCSS("width", "76px");
  const collapsed = await geometry(page, ".desktop-sidebar");
  await monitorDesktop(page);
  for (const href of ["/inventory", "/purchases", "/sales", "/dashboard"]) {
    await sidebar.locator(`.nav-item[href="${href}"]`).click();
    await expect(page).toHaveURL(href);
    expect(await geometry(page, ".desktop-sidebar")).toEqual(collapsed);
  }
  expect(await stopMonitor(page)).toEqual([]);
  await page
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  await expect(sidebar.locator(".nav-toggle, .nav-child")).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
  expect(fixture.unhandled).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("a direct module entry keeps mobile navigation free of dropdowns", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "Mobile drawer coverage");
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 650 });
  const fixture = await mockWorkspace(page);
  await page.goto("/purchases/list");
  await expect(
    page.getByRole("heading", { name: "Purchase", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const open = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await open.click();
  const drawer = page.locator(".mobile-sidebar");
  await expect(drawer.locator(".nav-toggle, .nav-child")).toHaveCount(0);
  const original = await geometry(page, ".mobile-sidebar");
  for (const href of [
    "/sales",
    "/inventory",
    "/replacements",
    "/accounts",
    "/dashboard",
    "/purchases",
  ]) {
    await drawer.locator(`.sidebar-nav a[href="${href}"]`).click();
    await expect(page).toHaveURL(href);
    await expect(drawer).toHaveCount(0);
    expect(await geometry(page, ".mobile-sidebar")).toEqual(
      original.filter(
        ({ selector }) => !selector.startsWith(".mobile-sidebar"),
      ),
    );
    const headingFits = await page.locator(".top-header").evaluate((header) => {
      const heading = header.querySelector("h1")!.getBoundingClientRect();
      const controls = header
        .querySelector(".header-controls")!
        .getBoundingClientRect();
      return heading.right <= controls.left;
    });
    expect(headingFits).toBe(true);
    await open.click();
    await expect(drawer).toBeVisible();
    expect(await geometry(page, ".mobile-sidebar")).toEqual(original);
    await expect(drawer.locator(".nav-toggle, .nav-child")).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  expect(fixture.writes).toEqual([]);
  expect(fixture.unhandled).toEqual([]);
  expect(fixture.errors).toEqual([]);
});
