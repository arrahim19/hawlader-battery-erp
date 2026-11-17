import { test, expect } from "@playwright/test";

test("extension attributes on the document roots do not break login hydration", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const inject = () => {
      document.documentElement?.setAttribute(
        "suppresshydrationwarning",
        "true",
      );
      document.documentElement?.setAttribute("data-qb-installed", "true");
      document.body?.setAttribute("data-gramm", "true");
      if (document.documentElement && document.body) observer.disconnect();
    };
    const observer = new MutationObserver(inject);
    observer.observe(document, { childList: true, subtree: true });
    inject();
  });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute(
    "data-qb-installed",
    "true",
  );
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Show password"]');
    return (
      button &&
      Object.keys(button).some((key) => key.startsWith("__reactProps$"))
    );
  });
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  expect(
    errors.filter((error) =>
      /hydrat|server rendered HTML|didn't match/i.test(error),
    ),
  ).toEqual([]);
});
