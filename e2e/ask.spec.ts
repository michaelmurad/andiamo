import { expect, test, type Page, type Route } from "@playwright/test";

/** The Ask box. The model is unreachable in e2e (see playwright.config.ts), so most tests stub /api/edit. */

// Each test plans a trip. Sending its own address, as the proxy would (see TRUSTED_PROXY_HOPS in
// playwright.config.ts), keeps it out of the shared limit the other specs use.
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `e2e-ask-${info.testId}-${info.retry}` });
});

const TRIP = "/trip?start=2027-05-14&days=3&hub=Rome&pace=balanced&likes=food,art&crowds=ok&price=3&trip=auto";

const ask = (page: Page) => page.getByRole("textbox", { name: "Ask for a change" });
const stopTitles = (page: Page) => page.locator("article.an-stop h3").allTextContents();
const changed = (page: Page) => page.locator("article.an-stop.is-changed");
const undoBar = (page: Page) => page.locator(".an-undo");

async function openTrip(page: Page) {
  await page.goto(TRIP);
  await expect(page.locator("section.an-day").first()).toBeVisible({ timeout: 30_000 });
  await expect(ask(page)).toBeEnabled();
}

interface Stop { key: string; placeId: string | null; label: string }
interface Plan { days: { stops: Stop[] }[] }

/** Answers every /api/edit call with `reply(body)`, and records the bodies sent. */
async function stubEdit(page: Page, reply: (body: { plan: Plan; message: string; answer?: unknown }) => { status?: number; json: unknown }) {
  const sent: { plan: Plan; message: string; answer?: unknown }[] = [];
  await page.route("**/api/edit", async (route: Route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    const { status = 200, json } = reply(body);
    await route.fulfill({ status, json });
  });
  return sent;
}

/** An edit the stub can make without the model: drop day 1's first place and mark day 2's first stop changed. */
function removeFirst(plan: Plan) {
  const gone = plan.days[0].stops.find((s) => s.placeId)!;
  const next = { ...plan, days: plan.days.map((d, i) => (i === 0 ? { ...d, stops: d.stops.filter((s) => s.key !== gone.key) } : d)) };
  return {
    json: { kind: "edited", plan: next, places: {}, changed: [plan.days[1].stops[0].key], summary: `Removed ${gone.label} from day 1.` },
    gone: gone.label,
  };
}

test("the real edit route accepts the plan the trip page made", async ({ page }) => {
  await openTrip(page);
  const response = page.waitForResponse("**/api/edit");
  await ask(page).fill("Make day 1 slower");
  await ask(page).press("Enter");
  // With no model the route answers 503; a plan the schema rejected would be a 400 with the zod message instead.
  expect((await response).status()).toBe(503);
  await expect(page.getByRole("group", { name: "The planner didn't answer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("an edit marks what changed, and Undo puts the plan back", async ({ page }) => {
  await openTrip(page);
  const before = await stopTitles(page);
  let gone = "";
  const sent = await stubEdit(page, ({ plan }) => {
    const r = removeFirst(plan);
    gone = r.gone;
    return { json: r.json };
  });

  await page.getByRole("button", { name: "More food" }).click();
  await expect(undoBar(page)).toContainText(`Removed ${gone} from day 1.`);
  expect(sent[0].message).toBe("More food");
  expect(sent[0].plan.days).toHaveLength(3);
  expect(await stopTitles(page)).not.toContain(gone);
  await expect(changed(page)).toHaveCount(1);
  await expect(changed(page)).toContainText("Changed");

  await page.getByRole("button", { name: "Undo" }).click();
  expect(await stopTitles(page)).toEqual(before);
  await expect(changed(page)).toHaveCount(0);
  await expect(undoBar(page)).toHaveCount(0);
});

test("the agent asks one question, and the answer goes back with the request", async ({ page }) => {
  await openTrip(page);
  const before = await stopTitles(page);
  const sent = await stubEdit(page, ({ answer }) =>
    answer ? { json: { kind: "unchanged" } } : { json: { kind: "ask", question: "Which day should be slower?", options: ["Day 1", "Day 2"] } },
  );

  await ask(page).fill("Slow it down");
  await ask(page).press("Enter");
  const question = page.getByRole("group", { name: "Which day should be slower?" });
  await expect(question).toBeVisible();
  // While the question is open the suggestions step aside.
  await expect(page.getByRole("button", { name: "More food" })).toHaveCount(0);

  await question.getByRole("button", { name: "Day 2" }).click();
  await expect(question).toHaveCount(0);
  expect(sent[1]).toMatchObject({ message: "Slow it down", answer: { question: "Which day should be slower?", option: "Day 2" } });
  expect(await stopTitles(page)).toEqual(before);
});

test("an undo survives a question, until the next edit", async ({ page }) => {
  await openTrip(page);
  let calls = 0;
  await stubEdit(page, ({ plan, answer }) => {
    calls++;
    if (calls === 1) return { json: removeFirst(plan).json };
    if (!answer) return { json: { kind: "ask", question: "Which day?", options: ["Day 3", "Keep it"] } };
    return { json: { kind: "unchanged" } };
  });

  await page.getByRole("button", { name: "Cheaper" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();

  await ask(page).fill("Add a museum");
  await ask(page).press("Enter");
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("a refusal names the reason, and a failure can be retried", async ({ page }) => {
  await openTrip(page);
  let calls = 0;
  await stubEdit(page, ({ plan }) => {
    calls++;
    if (calls === 1) return { json: { kind: "refused", reason: "Uffizi Gallery is in the Florence area, not Rome" } };
    if (calls === 2) return { status: 503, json: { error: "The planner didn't answer" } };
    return { json: removeFirst(plan).json };
  });

  await ask(page).fill("Add the Uffizi");
  await ask(page).press("Enter");
  await expect(page.getByRole("group", { name: "Uffizi Gallery is in the Florence area, not Rome" })).toBeVisible();
  await page.getByRole("button", { name: "Ask something else" }).click();

  await page.getByRole("button", { name: "Rainy-day version" }).click();
  await expect(page.getByRole("group", { name: "The planner didn't answer" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(undoBar(page)).toContainText("Removed");
  expect(calls).toBe(3);
});

test("while a change is on its way the bar says so and the plan waits", async ({ page }) => {
  await openTrip(page);
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/edit", async (route) => {
    await held;
    await route.fulfill({ json: removeFirst(route.request().postDataJSON().plan).json });
  });

  await page.getByRole("button", { name: "More food" }).click();
  const form = page.locator("form.an-ask-form");
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(form.getByRole("status")).toHaveText("Changing the plan");
  await expect(form.getByRole("button", { name: "Changing the plan" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cheaper" })).toHaveCount(0);

  release();
  await expect(undoBar(page)).toBeVisible();
  await expect(form).toHaveAttribute("aria-busy", "false");
  await expect(ask(page)).toBeEnabled();
});

test("the undo bar leaves after a while, unless it's pointed at; Changed marks stay", async ({ page }) => {
  await page.clock.install();
  await openTrip(page);
  await stubEdit(page, ({ plan }) => ({ json: removeFirst(plan).json }));

  await page.getByRole("button", { name: "More food" }).click();
  await expect(undoBar(page)).toBeVisible();
  await undoBar(page).hover();
  await page.clock.fastForward(20_000);
  await expect(undoBar(page)).toBeVisible();

  await page.mouse.move(0, 0);
  await page.clock.fastForward(7_000);
  await expect(undoBar(page)).toBeVisible();
  await page.clock.fastForward(2_000);
  await expect(undoBar(page)).toHaveCount(0);
  await expect(changed(page)).toHaveCount(1);
});
