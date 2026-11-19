import { test, expect } from "@playwright/test";

test("sales navigation keeps the header and tabs fixed during delayed loads", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === "/auth/me")
      return data({
        id: "owner",
        name: "Owner",
        login: "owner",
        roles: ["OWNER"],
        permissions: ["sales.manage", "finance.read"],
      });
    if (path === "/modules/sales") {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return data({});
    }
    if (path === "/sales/options") {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return data({
        types: [],
        products: [],
        customers: [],
        paymentAccounts: [],
      });
    }
    if (path === "/sales") {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return data({ items: [], total: 0, page: 1, pageSize: 10 });
    }
    return route.abort();
  });
  await page.goto("/sales/new");
  await page.locator('.erp-tabs[data-module="sales"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const geometry = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [".top-header", ".main-content", '.erp-tabs[data-module="sales"]'].map(
          (selector) => {
            const rect = document
              .querySelector(selector)!
              .getBoundingClientRect();
            return [selector, [rect.x, rect.y, rect.width, rect.height]];
          },
        ),
      ),
    );
  const initial = await geometry();
  for (const label of ["Sales List", "New Sale"]) {
    await page.evaluate(() => {
      const state = window as unknown as { salesFrames: unknown[] };
      state.salesFrames = [];
      const until = performance.now() + 1400;
      function sample() {
        state.salesFrames.push(
          Object.fromEntries(
            [
              ".top-header",
              ".main-content",
              '.erp-tabs[data-module="sales"]',
            ].map((selector) => {
              const rect = document
                .querySelector(selector)
                ?.getBoundingClientRect();
              return [
                selector,
                rect ? [rect.x, rect.y, rect.width, rect.height] : null,
              ];
            }),
          ),
        );
        if (performance.now() < until) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page
      .getByRole("navigation", { name: "Module tabs" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.waitForTimeout(1500);
    expect(await geometry()).toEqual(initial);
    const frames = await page.evaluate(
      () => (window as unknown as { salesFrames: unknown[] }).salesFrames,
    );
    expect(frames.length).toBeGreaterThan(2);
    for (const frame of frames) expect(frame).toEqual(initial);
  }
});
