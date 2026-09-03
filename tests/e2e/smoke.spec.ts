import { expect, test } from "@playwright/test";

/**
 * Smoke tests that need no database. The app is started against an unreachable
 * Supabase URL, so every server read comes back empty and these cover the shell,
 * the client side gate demo, and form validation rather than real content.
 */

test.describe("landing", () => {
  test("renders the hero and the spoiler demo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("without getting spoiled");
    await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
  });

  test("the slider hides and reveals the sample cards", async ({ page }) => {
    await page.goto("/");

    // Every title is readable at level 0. Only the bodies seal and open.
    await expect(page.getByRole("heading", { name: /How big is Leonida/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /second act job/ })).toBeVisible();
    await expect(page.getByText("Body hidden until Chapter 2")).toBeVisible();
    await expect(page.getByText(/mid game answer/)).toHaveCount(0);

    const slider = page.getByRole("slider", { name: /Drag to set/ });
    await slider.fill("7");

    await expect(page.getByText(/mid game answer/)).toBeVisible();
    await expect(page.getByText(/Body hidden until/)).toHaveCount(0);

    await slider.fill("0");
    await expect(page.getByText("Body hidden until Chapter 2")).toBeVisible();
  });

  test("does not scroll horizontally", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("feed shell", () => {
  test("renders the tabs, the topic chips, and an empty state", async ({ page }) => {
    await page.goto("/feed");
    await expect(page.getByRole("link", { name: "Latest" })).toBeVisible();
    await expect(page.getByRole("link", { name: "All topics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  });

  test("explains the shield in the context column and nudges a guest to sign up", async ({ page }) => {
    await page.goto("/feed");

    const context = page.getByRole("complementary", { name: "Context" });
    await expect(context).toContainText("The spoiler shield");
    await expect(context).toContainText("Reading as a guest");
  });
});

test.describe("compose", () => {
  test("sends a signed out visitor to sign in", async ({ page }) => {
    await page.goto("/new");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("shows inline validation before the form is sent", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valueMissing", true);
  });
});

test("404 stays on brand", async ({ page }) => {
  const response = await page.goto("/p/does-not-exist-at-all");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Nothing at this address" })).toBeVisible();
});

test.describe("sign out", () => {
  test("is not offered to a reader who is not signed in", async ({ page }) => {
    await page.goto("/feed");

    await expect(page.getByRole("button", { name: /Account:/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("sends a signed out visitor away from settings rather than showing the button", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
