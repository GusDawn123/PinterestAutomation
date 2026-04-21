import { test, expect } from "@playwright/test";

test.describe("carmen-web smoke", () => {
  test("landing page renders with title + sign-in button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Pinterest Cockpit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("anonymous user cannot reach /dashboard directly", async ({ page }) => {
    const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    // Clerk middleware should intercept — either redirect (non-200) or render a
    // Clerk-controlled sign-in screen. Either way the dashboard heading must NOT appear.
    expect([200, 301, 302, 307, 308]).toContain(response?.status() ?? 0);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toHaveCount(0);
  });

  test("anonymous user cannot reach /calendar directly", async ({ page }) => {
    await page.goto("/calendar", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Scheduled pins" })).toHaveCount(0);
  });

  test("anonymous user cannot reach /analytics directly", async ({ page }) => {
    await page.goto("/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Analytics" })).toHaveCount(0);
  });
});
