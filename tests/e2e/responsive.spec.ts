import { expect, test } from "@playwright/test";

const WIDTHS = [1440, 1024, 768, 390];

test.describe("shell layout", () => {
  test("swaps the rail for a bottom bar on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/feed");
    await page.getByRole("button", { name: "Close" }).click();

    // The rail is the only place that says "New post". The bottom bar says "Post".
    const railLink = page.getByRole("link", { name: "New post", exact: true });
    const barLink = page.getByRole("link", { name: "Post", exact: true });

    await expect(railLink).toBeVisible();
    await expect(barLink).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(railLink).toBeHidden();
    await expect(barLink).toBeVisible();
  });

  test("never scrolls horizontally at any width", async ({ page }) => {
    await page.goto("/feed");
    await page.getByRole("button", { name: "Close" }).click();

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
