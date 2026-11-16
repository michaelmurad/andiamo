# Andiamo

Andiamo plans short trips in Italy. Pick a base city, the dates, what you like and how busy you want the days, and you get a day-by-day plan of real places, each with a photo and the reason it's there. You change the plan with a swap or one sentence ("Slower day 2", "More food"), and every change can be undone.

The model ranks and the code decides. Claude picks the base and ranks the places that suit you; a deterministic scheduler turns that ranking into days, checking opening hours, travel time and pace. If the model is unavailable, the scheduler plans the trip on its own, so you always get a plan.

## How it works

1. **Setup** (`/`): a GET form, so the whole trip lives in the URL and can be shared or reloaded.
2. **Planning** (`/trip`): a Server Component reads the settings from the URL and streams the plan in.
   - `src/lib/ai/select.ts` asks Claude for the base city, a ranked shortlist with reasons, and the places your notes rule out (prompt: `prompts/select-places.yaml`).
   - `src/lib/plan/schedule.ts` builds the days from that shortlist. Without one, it ranks by itself.
3. **Editing** (the Ask box): `POST /api/edit` turns one sentence into edit operations (prompt: `prompts/edit-plan.yaml`). Code checks and applies each operation and reschedules the days it touches. When a request is ambiguous, the agent asks one question with the answers as buttons.

The place data comes from `src/data/italy.json`. It's never edited by hand: `src/lib/data/normalize.ts` fixes, flags or rejects bad records at load time, and `/data` lists everything it found.

## Getting started

You need Node.js and an [Anthropic API key](https://console.anthropic.com/).

```bash
npm install
```

Create `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

The app runs without a key too: model calls fail, and every trip is planned by the scheduler alone. To skip the model on purpose, add `ai=off` to a trip URL.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | For AI planning and editing | Used by the Anthropic SDK. |
| `ANTHROPIC_BASE_URL` | No | Points the SDK somewhere else (the e2e tests use it to stub the model out). |
| `TRUSTED_PROXY_HOPS` | No | How many proxies in front of the app append to `x-forwarded-for`. Defaults to `1` (Vercel or one load balancer). `0` means none, so all callers share one rate limit. |

Planning is limited to 10 trips a minute per address and editing to 20. The limits are held in memory per instance, so they slow abuse rather than stop it; set a spend limit on the Anthropic workspace as well.

## Trip URLs

`/trip` reads everything from the query string. Anything missing or invalid falls back to a default.

| Param | Example | Meaning |
| --- | --- | --- |
| `start` | `2026-12-01` | First day of the trip |
| `days` | `3` | Trip length, 1 to 7 days (the setup screen offers up to 3) |
| `hub` | `Rome`, `auto` | Base city: Rome, Florence, Milan, Venice or Bologna. `auto` lets the model pick. |
| `pace` | `balanced` | How full each day is: `relaxed`, `balanced` or `packed` |
| `likes` | `food,art` | Interests: `food`, `art`, `history`, `outdoors`, `hidden-gems` |
| `crowds` | `avoid`, `ok` | Whether to steer away from busy places |
| `price` | `3` | Highest price level, 1 to 4 |
| `trip` | `auto`, `none` | Whether the plan may include a day trip |
| `notes` | `vegetarian, no museums on Monday` | Free text for the model (500 characters at most) |
| `ai` | `off` | Plan with the scheduler alone |

`POST /api/plan` takes the same settings as JSON (`{ settings, notes, useModel }`) and returns the plan.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build and server |
| `npm run lint` | ESLint |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | End-to-end tests (Playwright) against a production build. The model is stubbed out, so no paid calls. |
| `npm run eval` | Runs the select-places eval (needs a key in `.env.local`) |
| `npm run eval:calibrate` | Calibrates the eval's judge |
| `npm run eval:compare` | Compares eval runs |
| `npm run photos` | Fetches place and city photos from Wikimedia Commons |

## Project layout

```
src/
  app/              Routes: setup (/), trip, data quality (/data), photo credits (/credits), api/plan, api/edit
  components/andiamo/  The design system's components
  lib/ai/           Model calls and prompt loading
  lib/plan/         Settings, scheduler, edits, availability
  lib/data/         Place data loading and normalization
  data/             italy.json and the photo manifests
prompts/            Versioned prompts and model settings (YAML)
evals/select-places/  Eval cases, graders, calibration and reviews
scripts/photos/     Photo fetch script and its curated sources
e2e/                Playwright tests
docs/               Design system
```

## Prompts and evals

Prompt text and model settings live in `prompts/*.yaml`, not in code. Bump `version` on any change, so eval results can be compared across versions. The select-places eval (`evals/select-places/`) grades the shortlist with code checks and a model judge; see `evals/select-places/cases.md` for what each case tests.

## Photos

Photos are real pictures of each place from Wikimedia Commons. To add or change one, edit `scripts/photos/sources.json` and run `npm run photos`. It writes the crops to `public/photos/` and the credits to `src/data/photos.json` and `src/data/hub-photos.json`; commit all three. Credits are shown at `/credits`.

## Where to make common changes

| To… | Change |
| --- | --- |
| Make a pace fuller or emptier | `PACE_RULES` in `src/lib/plan/schedule.ts` |
| Weigh ratings or interests differently | `WEIGHTS` in `src/lib/plan/score.ts` |
| Add an interest | `INTERESTS` in `src/lib/plan/types.ts`, `INTEREST_TAGS` in `src/lib/plan/score.ts`, and the list in `src/app/setup-form.tsx` |
| Fix a place's hours or season | `OVERRIDES` in `src/lib/data/overrides.ts` (quote the source) |
| Add a day-trip town | `SATELLITES` in `src/lib/data/overrides.ts` |
| Change how Claude ranks places | `prompts/select-places.yaml`: bump `version`, then run `npm run eval` |
| Teach the Ask box a new kind of edit | `EditOp` in `src/lib/plan/edits.ts`, `EditOpSchema` in `src/lib/ai/edit.ts`, and `prompts/edit-plan.yaml` |
| Allow longer trips | `MAX_TRIP_DAYS` in `src/lib/plan/settings.ts` (the planner accepts up to 7) |
| Change travel estimates | `travel()` in `src/lib/geo.ts` (keep it monotonic: farther is never quicker) |

## Gotchas

- **This is Next.js 16.** `cacheComponents: true` in `next.config.ts` means pages prerender by default. Anything per-request (the URL, headers, today's date) has to sit behind `Suspense`, and paid work behind `await connection()` too, so prerenders and prefetches never call the model. `searchParams` is a promise. Read `node_modules/next/dist/docs/` before using an API you think you know.
- **Prompts are read from disk at runtime.** A new route that plans must be added to `outputFileTracingIncludes` in `next.config.ts`, or the production build can't find the YAML.
- **There's no database.** A trip lives in its URL; after an edit, the client holds the plan and sends the whole plan with each request to `/api/edit`.
- **Stop keys are `"{day}-{placeId}"`**, or `"{day}-{slot}"` for an open meal slot. Edit operations and the `changed` marks refer to stops by these keys.
- **An edit re-plans one day only.** Every other day is passed through unchanged, and within that day the scheduler tries to keep the other stops where they were.
- **The rate limit is in memory.** See [Environment variables](#environment-variables).

## Design system

All UI follows the Andiamo design system. Read `docs/design-system.md` before building or changing a screen, and build from `@/components/andiamo`. Don't hand-edit `src/app/andiamo.css`; it's generated from the design system. `AGENTS.md` has the short version.

## Built with

Next.js 16 (App Router, Server Components), React 19, Tailwind CSS 4, the Anthropic TypeScript SDK, Zod, Vitest and Playwright.
