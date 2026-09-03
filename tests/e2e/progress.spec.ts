import { expect, test } from "@playwright/test";

/**
 * Anonymous progress. None of this needs a database: the level lives in a cookie
 * and the gate that reads it runs on the server from that cookie alone.
 */

test.describe("the one time sheet", () => {
  test("opens on a first visit and names the question", async ({ page }) => {
    await page.goto("/feed");

    const sheet = page.getByRole("dialog", { name: "Where are you in the story?" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await expect(sheet).toContainText("Haven't played");
  });

  test("saving a level writes the cookie and closes the sheet", async ({ page, context }) => {
    await page.goto("/feed");

    const sheet = page.getByRole("dialog");
    await sheet.getByRole("slider", { name: "How far you have played" }).fill("5");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByRole("dialog")).toBeHidden();

    const cookie = (await context.cookies()).find((c) => c.name === "askgta6_progress");
    expect(cookie?.value).toBe("5");
    expect(cookie?.sameSite).toBe("Lax");
    // A year, allowing for the seconds spent in this test.
    expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(360 * 24 * 60 * 60);
  });

  test("walking away records level 0 and it never asks again", async ({ page, context }) => {
    await page.goto("/feed");
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect
      .poll(async () => (await context.cookies()).find((c) => c.name === "askgta6_progress")?.value)
      .toBe("0");

    await page.reload();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("stays shut for a returning reader", async ({ page, context }) => {
    await context.addCookies([
      { name: "askgta6_progress", value: "3", url: "http://127.0.0.1:3100" },
    ]);

    await page.goto("/feed");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("reopens from the mobile trigger, which names the level", async ({ page, context }) => {
    await context.addCookies([
      { name: "askgta6_progress", value: "3", url: "http://127.0.0.1:3100" },
    ]);

    // The trigger is for small screens only. On desktop the right column already
    // carries the same control, so it would be one button too many.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/feed");

    const trigger = page.getByRole("button", { name: "Level: Chapter 3" });
    await expect(trigger).toBeVisible();

    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Where are you in the story?" })).toBeVisible();
  });

  test("hides the mobile trigger on desktop, where the right column has the control", async ({ page, context }) => {
    await context.addCookies([
      { name: "askgta6_progress", value: "3", url: "http://127.0.0.1:3100" },
    ]);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/feed");

    await expect(page.getByRole("button", { name: "Level: Chapter 3" })).toBeHidden();
    await expect(page.getByRole("complementary", { name: "Context" })).toContainText("Chapter 3");
  });
});

test.describe("the right column control", () => {
  test("offers a logged out reader the same control the sheet does", async ({ page, context }) => {
    await context.addCookies([
      { name: "askgta6_progress", value: "2", url: "http://127.0.0.1:3100" },
    ]);
    await page.goto("/feed");

    const column = page.getByRole("complementary", { name: "Context" });
    await expect(column).toContainText("Your progress");
    await expect(column).toContainText("Chapter 2");
    await expect(column.getByRole("button", { name: "Save progress" })).toBeVisible();
  });
});
