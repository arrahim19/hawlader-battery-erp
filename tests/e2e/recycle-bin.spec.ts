import { test, expect } from "@playwright/test";

test("recycle bin precedes settings and restores a deleted supplier", async ({
  page,
}, info) => {
  let restored = false;
  let failRestore = true;
  const entry = {
    id: "deleted-entry",
    name: "Deleted Supplier",
    phone: "01712345678",
    company: "Battery Company",
    type: "Supplier",
    deletedAt: "2026-11-15T04:00:00.000Z",
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === "/auth/me")
      return data({
        id: "owner",
        name: "Owner",
        login: "owner",
        roles: ["OWNER"],
        permissions: ["parties.suppliers", "settings.manage"],
      });
    if (path.startsWith("/modules/"))
      return data({ status: "FOUNDATION_ONLY" });
    if (path === "/auth/csrf") return data({ token: "csrf" });
    if (path === "/suppliers/recycle-bin") return data(restored ? [] : [entry]);
    if (path === "/suppliers/recycle-bin/deleted-entry/restore") {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-csrf-token"]).toBe("csrf");
      if (failRestore)
        return route.fulfill({
          status: 409,
          json: { error: { message: "Please retry restore." } },
        });
      restored = true;
      return data({ id: "supplier" });
    }
    return route.abort();
  });
  await page.goto("/recycle-bin");
  await expect(
    page.getByRole("button", { name: "Restore Deleted Supplier", exact: true }),
  ).toBeVisible();
  if (info.project.name === "desktop") {
    const links = await page
      .locator(".desktop-sidebar .sidebar-nav a")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(links.indexOf("/recycle-bin")).toBeGreaterThanOrEqual(0);
    expect(links.indexOf("/settings")).toBe(links.indexOf("/recycle-bin") + 1);
  }
  await page
    .getByRole("button", { name: "Restore Deleted Supplier", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Please retry restore." }),
  ).toBeVisible();
  failRestore = false;
  await page
    .getByRole("button", { name: "Restore Deleted Supplier", exact: true })
    .click();
  await expect(
    page.getByText("Recycle Bin খালি।", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("পুনরুদ্ধার করা হয়েছে");
});
