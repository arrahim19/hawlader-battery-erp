import { test, expect } from "@playwright/test";

test("recycle bin restores sales, purchases and suppliers and finalizes only after confirmation", async ({
  page,
}, info) => {
  let fail = true;
  let rows = [
    {
      id: "sale-entry",
      name: "HWB-000123",
      type: "Sale",
      party: "Buyer",
      amount: "190.00",
      deletedAt: "2026-11-17T04:00:00Z",
    },
    {
      id: "purchase-entry",
      name: "PUR-123",
      type: "Purchase",
      party: "Supplier",
      amount: "120.00",
      deletedAt: "2026-11-17T04:00:00Z",
    },
    {
      id: "supplier-entry",
      name: "Deleted Supplier",
      type: "Supplier",
      party: "Company",
      amount: null,
      deletedAt: "2026-11-17T04:00:00Z",
    },
  ];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/v1", "");
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === "/auth/me")
      return data({
        id: "owner",
        name: "Owner",
        login: "owner",
        roles: ["OWNER"],
        permissions: [
          "sales.manage",
          "purchases.manage",
          "transactions.reverse",
          "parties.suppliers",
          "settings.manage",
        ],
      });
    if (path.startsWith("/modules/"))
      return data({ status: "FOUNDATION_ONLY" });
    if (path === "/auth/csrf") return data({ token: "csrf" });
    if (path === "/recycle-bin") return data(rows);
    if (path.startsWith("/recycle-bin/")) {
      expect(req.headers()["x-csrf-token"]).toBe("csrf");
      expect(req.postDataJSON()).toEqual({ confirmed: true });
      if (fail)
        return route.fulfill({
          status: 409,
          json: { error: { message: "Stock unavailable. Please retry." } },
        });
      expect(req.method()).toBe(path.endsWith("/restore") ? "POST" : "DELETE");
      rows = rows.filter((row) => row.id !== path.split("/")[2]);
      return data({ status: "OK" });
    }
    return route.abort();
  });
  await page.goto("/recycle-bin");
  if (info.project.name === "desktop") {
    const links = await page
      .locator(".desktop-sidebar .sidebar-nav a")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(links.indexOf("/settings")).toBe(links.indexOf("/recycle-bin") + 1);
  }
  await page
    .getByRole("button", { name: "Restore HWB-000123", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("button", { name: "Restore", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Stock unavailable");
  fail = false;
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore HWB-000123", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Restore PUR-123", exact: true })
    .click();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Final Delete Deleted Supplier", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Final Delete", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Restore Deleted Supplier", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore Deleted Supplier", exact: true })
    .click();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Restore");
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("final delete removes the record from the Bin and leaves errors visible", async ({
  page,
}) => {
  let removed = false,
    fail = true;
  const item = {
    id: "sale",
    name: "HWB-000777",
    type: "Sale",
    party: "Buyer",
    amount: "5.00",
    deletedAt: "2026-11-17T04:00:00Z",
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/v1", "");
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === "/auth/me")
      return data({
        id: "owner",
        name: "Owner",
        login: "owner",
        roles: ["OWNER"],
        permissions: ["sales.manage", "transactions.reverse"],
      });
    if (path.startsWith("/modules/")) return data({});
    if (path === "/auth/csrf") return data({ token: "csrf" });
    if (path === "/recycle-bin") return data(removed ? [] : [item]);
    if (path === "/recycle-bin/sale") {
      expect(req.method()).toBe("DELETE");
      expect(req.postDataJSON()).toEqual({ confirmed: true });
      if (fail)
        return route.fulfill({
          status: 409,
          json: { error: { message: "Please retry." } },
        });
      removed = true;
      return data({ status: "FINALIZED" });
    }
    return route.abort();
  });
  await page.goto("/recycle-bin");
  await page
    .getByRole("button", { name: "Final Delete HWB-000777", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Final Delete", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Please retry");
  fail = false;
  await dialog
    .getByRole("button", { name: "Final Delete", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
