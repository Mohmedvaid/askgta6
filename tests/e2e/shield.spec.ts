import { expect, test } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:3100";

/**
 * The spoiler shield through a real browser. None of this needs a database: the
 * shield lives in two cookies and the server decides gating from them alone.
 */

test.describe("the header pill", () => {
  test("reads as off on a first visit, with no sheet in the way", async ({ page }) => {
    await page.goto("/feed");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Spoiler shield/ })).toContainText("off");
  });

  test("opens a popover with the toggle, and no chapter list while off", async ({ page }) => {
    await page.goto("/feed");
    await page.getByRole("button", { name: /Spoiler shield/ }).click();

    const popover = page.getByRole("dialog", { name: "Spoiler shield" });
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("switch", { name: "Spoiler shield" })).toHaveAttribute("aria-checked", "false");
    await expect(popover.getByRole("button", { name: "Chapter 3" })).toHaveCount(0);
  });

  test("turning it on writes both cookies and renames the pill", async ({ page, context }) => {
    await page.goto("/feed");
    await page.getByRole("button", { name: /Spoiler shield/ }).click();
    await page.getByRole("switch", { name: "Spoiler shield" }).click();

    await expect(page.getByRole("button", { name: /Spoiler shield/ })).toContainText("Haven't played");

    const cookies = await context.cookies();
    const shield = cookies.find((c) => c.name === "askgta6_shield");
    const progress = cookies.find((c) => c.name === "askgta6_progress");

    expect(shield?.value).toBe("on");
    expect(shield?.sameSite).toBe("Lax");
    expect(shield!.expires - Date.now() / 1000).toBeGreaterThan(360 * 24 * 60 * 60);
    expect(progress?.value).toBe("0");
  });

  test("picking a chapter persists and survives a reload", async ({ page, context }) => {
    await context.addCookies([{ name: "askgta6_shield", value: "on", url: ORIGIN }]);
    await page.goto("/feed");

    await page.getByRole("button", { name: /Spoiler shield/ }).click();
    await page.getByRole("button", { name: "Chapter 5", exact: true }).click();

    await expect(page.getByRole("button", { name: /Spoiler shield/ })).toContainText("Chapter 5");
    await expect
      .poll(async () => (await context.cookies()).find((c) => c.name === "askgta6_progress")?.value)
      .toBe("5");

    await page.reload();
    await expect(page.getByRole("button", { name: /Spoiler shield/ })).toContainText("Chapter 5");
  });

  test("switching it back off keeps the chapter for next time", async ({ page, context }) => {
    await context.addCookies([
      { name: "askgta6_shield", value: "on", url: ORIGIN },
      { name: "askgta6_progress", value: "6", url: ORIGIN },
    ]);
    await page.goto("/feed");

    await page.getByRole("button", { name: /Spoiler shield/ }).click();
    await page.getByRole("switch", { name: "Spoiler shield" }).click();

    await expect(page.getByRole("button", { name: /Spoiler shield/ })).toContainText("off");
    await expect
      .poll(async () => (await context.cookies()).find((c) => c.name === "askgta6_progress")?.value)
      .toBe("6");
  });

  test("is there on mobile too, with no floating trigger left over", async ({ page, context }) => {
    await context.addCookies([{ name: "askgta6_shield", value: "on", url: ORIGIN }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/feed");

    await expect(page.getByRole("button", { name: /Spoiler shield/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Level:/ })).toHaveCount(0);
  });
});

test.describe("the landing demo", () => {
  test("still shows the gate working, whatever the reader's own shield says", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /second act job/ })).toBeVisible();
    await expect(page.getByText("Body hidden until Chapter 2")).toBeVisible();

    await page.getByRole("slider", { name: /Drag to set/ }).fill("7");
    await expect(page.getByText(/Body hidden until/)).toHaveCount(0);
  });
});
