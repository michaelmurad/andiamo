import { expect, test, type Page } from "@playwright/test";

const HUBS = ["Rome", "Florence", "Milan", "Venice", "Bologna"];

const days = (page: Page) => page.locator("section.an-day");
const stopTitles = (page: Page) => page.locator("article.an-stop h3").allTextContents();

/** Waits until the plan has streamed in and replaced the loading screen. */
async function waitForPlan(page: Page) {
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0, { timeout: 30_000 });
  await expect(days(page).first()).toBeVisible();
}

test("plans a trip from the setup screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Where to?" })).toBeVisible();

  await page.getByRole("button", { name: /^Florence/ }).click();
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("radio", { name: "Relaxed" }).click();
  await page.getByRole("button", { name: "Plan my trip" }).click();

  await expect(page).toHaveURL(/\/trip\?/);
  const query = new URL(page.url()).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({ hub: "Florence", pace: "relaxed", likes: "food,art,history", days: "3" });

  await waitForPlan(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Florence");
  await expect(page.locator(".an-trip-meta")).toContainText("Relaxed pace");
  await expect(days(page)).toHaveCount(3);

  for (const day of await days(page).all()) {
    const stops = day.locator("article.an-stop");
    expect(await stops.count()).toBeGreaterThan(0);
    // Every place is shown with a photo (or its drawn stand-in).
    await expect(stops.locator(".an-photo")).toHaveCount(await stops.count());
  }

  const directions = page.getByRole("link", { name: "Directions" });
  expect(await directions.count()).toBeGreaterThan(0);
  for (const href of await directions.evaluateAll((links) => links.map((a) => a.getAttribute("href")))) {
    expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/);
  }
});

test("a shared trip link plans the same trip again", async ({ page }) => {
  const url = "/trip?start=2027-03-05&days=2&hub=Bologna&pace=packed&likes=food&crowds=ok";
  await page.goto(url);
  await waitForPlan(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bologna");
  await expect(days(page)).toHaveCount(2);
  await expect(days(page).first().locator("h2")).toHaveText("Fri 5 Mar");
  const first = await stopTitles(page);

  await page.reload();
  await waitForPlan(page);
  expect(await stopTitles(page)).toEqual(first);
});

test("Pick for me chooses a base", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Pick for me/ }).click();
  await page.getByRole("button", { name: "Plan my trip" }).click();

  await expect(page).toHaveURL(/hub=auto/);
  await waitForPlan(page);
  expect(HUBS).toContain(await page.getByRole("heading", { level: 1 }).textContent());
});

test("an invalid trip link falls back to the default trip", async ({ page }) => {
  await page.goto("/trip?days=99&hub=Atlantis&pace=frantic");
  await waitForPlan(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rome");
  await expect(days(page)).toHaveCount(3);
});

test("ai=off plans with the scheduler alone, the same trip every time", async ({ page }) => {
  // e2e can't see the model either way (it's unreachable here); the unit tests prove the call is skipped.
  await page.goto("/trip?start=2027-05-14&days=3&hub=Rome&pace=balanced&likes=food,art&crowds=ok&ai=off");
  await waitForPlan(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rome");
  await expect(days(page)).toHaveCount(3);
  const first = await stopTitles(page);
  await page.reload();
  await waitForPlan(page);
  expect(await stopTitles(page)).toEqual(first);
});
