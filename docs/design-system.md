# Andiamo design system

The full rules for building Andiamo's interface. The short version is in `AGENTS.md`; read this before any UI work.

The plan is the response, and the plan is made of places. Every place is shown with its photo and the few facts needed to judge it, so a three-day trip reads at a glance and every change is one tap or one sentence.

## Principles

- **Plan first, then tune.** Never show an empty state where a plan could be. Defaults are filled in; the traveller edits, never starts from blank.
- **Places have faces.** Wherever a place appears (hub card, stop card, swap option, browse row, trip banner) it appears with a photo. Text-only lists of places are not allowed.
- **Dense, not busy.** A stop card answers when, what, why, how long, how good and how much without opening anything. One line each, in a fixed order.
- **One tap or one sentence.** Every change is a swap, an add, or a one-line ask.
- **Changes are visible and reversible.** Anything the AI alters is marked `changed` until the next edit, and an undo stays on screen for 8 seconds, longer while it's pointed at or focused.

## Voice

- Write like a well-travelled friend: plain, specific, second person. "Opens at 9, before the square fills up." Not "This attraction is highly rated."
- Sentence case everywhere. Overlines are the only capitals.
- Suggested prompts are imperatives of two or three words: "Slower day 2", "More food", "Cheaper", "Rainy-day version".
- A refusal names the reason in a few words: "Closed Sundays", "Book ahead: 14 tables". No apologies.
- When the agent must ask, it asks one question and offers the answers as buttons.
- No emoji, no exclamation marks.

## Photography

- Use real photographs of the actual place, taken in daylight or at the hour of the visit: the building, the room, the dish, the view. No stock collages, no people posing at the camera, no text baked into the image.
- Crops: square for stop cards and thumbnails, portrait 4:5 for hub cards, wide 4:1 for the trip banner. Photos always fill their box and crop to cover; never letterbox.
- Photos inside cards take `radius-md`; a photo that is the whole card takes the card's radius.
- Text goes on a photo only over the `scrim` gradient, in `on-photo`, and only in two places: hub cards and the trip banner. Buttons on a photo are `Button variant="photo"`.
- While a photo loads, show `surface-sunken`. When a place has no photo, the `Photo` component draws a stand-in scene for its kind from the `art-*` tokens. The stand-in covers gaps; it is not the look of the product.
- Give `alt` the place name unless the name is printed beside the photo.

## Colour

- Three surfaces make the depth: the page is `surface`, day columns and tracks are `surface-sunken`, and anything you can pick up is `surface-raised` with a shadow.
- Text is `ink`; supporting text is `ink-muted`. Both read on all three surfaces and on every tint.
- `brand` (cypress green) marks the traveller's own choices and the way forward: the one primary button per screen, selected chips and hub cards, send, links, "Added", and the focus ring. Text on it is `on-brand`.
- `changed` (cobalt) means "the AI just changed this" and nothing else. Always show the "Changed" badge with the ring.
- `warning` on `warning-tint` means "check this before you go" and nothing else. Always an icon and words.
- `rating` colours the star only. Do not use it for anything else.
- Do not colour-code categories. A place's kind is carried by its icon and one word.
- There are two themes, `light` and `dark`, with the same token names. Use tokens only; never a literal hex.
- Focus ring: 2px solid `brand`, offset 2px. Inside the undo bar the ring is `surface-raised`.

## Type

- `display` and `day-title` are Instrument Serif, regular weight only; never bold it and never set it below 28px. Everything else is DM Sans.
- One `display` per screen: the trip title on the banner or the question on the setup screen.
- On a stop card, top to bottom: time (`label`, weight 700) with category (`meta`), name (`card-title`), the "why this" line (`caption`, `ink-muted`, two lines at most), then duration, rating and price (`meta`).
- Numbers that line up (times, durations, ratings, prices) use tabular numerals.
- Overlines label slots, days and form sections, with an icon for slots.

## Layout and shape

- The plan is a trip banner, then three day columns side by side with a `space-4` gap, then the ask bar floating at the bottom centre. No tabs. Below about 1000px the columns scroll sideways and snap.
- A day column is a `surface-sunken` rail with `radius-xl`. Inside it, slots run morning, lunch, afternoon, dinner, evening; cards are `space-3` apart and joined by a travel leg.
- Stop cards: `surface-raised`, `radius-lg`, `space-3` padding, `shadow-card`. On hover they lift to `shadow-raised`. No borders on cards.
- Buttons and inputs are `radius-md`. Chips and badges are `radius-pill`.
- Shadows step with height: `shadow-card` at rest, `shadow-raised` under the pointer and for the ask bar, `shadow-overlay` for what floats over the plan.
- Minimum tap target is 44px; chips are 36px tall with an invisible 44px hit area.

## States

- **Selected** (chips, hub cards): `brand` fill or ring plus a check.
- **Changed** (a card the AI altered): `changed-tint` ground, 2px `changed` ring, a "Changed" badge. Clears on the next edit or on undo.
- **Warning** (on a card): a `warning-tint` row at the foot of the card with icon and text.
- **Can't add** (browse drawer): the Add button is replaced by the reason on `warning-tint`.
- **Swapping**: tapping a stop card opens three alternatives in a popover anchored to it.
- **Undo**: a bar above the ask bar, `ink` ground with `surface-raised` text, holding the AI's one sentence and Undo. It leaves after 8 seconds; pointing at it or focusing it holds it. The `changed` marks stay.
- **Agent working**: while a change is on its way the ask bar says what it's doing ("Changing the plan") with a shimmer, `sparkles` breathes, send becomes a spinning `loader-circle`, a `brand` sweep runs along the bar's foot, and the plan dims to 60%. Reduced motion keeps the words and drops the movement.
- **Loading the first plan**: show the banner and three column rails with card-shaped blocks in `surface-raised` and photo boxes in `surface-sunken`; never a spinner on a blank page.

## Iconography

- Icons are Lucide outline icons (24px grid, 2px stroke, round caps), drawn by the `Icon` component in the colour of the text beside them. The set in use is the map in `src/components/andiamo/Icon.tsx`.
- Sizes: 14px in meta rows and overlines, 16px beside text, 20px standing alone.
- Every slot and every category has a fixed icon (lunch is `utensils`, a museum is `palette`); keep the pairing.
- `sparkles` marks the AI: the ask bar, the undo bar, the agent's question, the "Changed" badge and "Pick for me". Use it nowhere else.
- No emoji, and no second icon set.

## Components

Everything is in `src/components/andiamo/`, imported from `@/components/andiamo`. Read a component's props in its file before using it.

- **Setup screen:** `HubCard`, `Chip`, `PaceToggle`, one primary `Button`.
- **Plan screen:** `TripHeader`, then three `DayColumn`s of `StopCard`s joined by `TravelLeg`s; `SwapPopover` and `BrowseRow` for edits.
- **Agent:** `AskBar`, `UndoBar`, `AgentQuestion`. The agent never speaks any other way.
- **Foundations:** `Photo`, `Icon`.

If a screen needs something these don't cover, build it from Tailwind token utilities in the same style, and add it to `src/components/andiamo/` if it will be reused.

## Building screens

- Use the components for everything they cover. Use Tailwind utilities for page layout around them and for new pieces.
- Only Andiamo colours exist as utilities. `bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `text-ink`, `text-ink-muted`, `border-line`, `border-line-strong`, `bg-brand`, `text-on-brand`, `bg-brand-tint`, `ring-changed`, `bg-changed-tint`, `text-warning`, `bg-warning-tint` and the rest follow the token names. Tailwind's default palette (`bg-red-500`, `text-white`) is switched off on purpose.
- Spacing tokens are Tailwind's scale: `space-3` is `p-3`, `gap-3`; `space-6` is `p-6`.
- Radius: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-pill`. Shadows: `shadow-card`, `shadow-raised`, `shadow-overlay`.
- Type: `font-display` and `font-sans`, with sizes `text-display`, `text-day-title`, `text-card-title`, `text-body`, `text-caption`, `text-label`, `text-meta`, `text-overline`.
- The plan screen is `TripHeader`, then `grid grid-cols-3 items-start gap-4` holding three `DayColumn className="w-auto"`, then `UndoBar` and `AskBar` centred below.

## Server and client

- `PaceToggle`, `StopCard`, `DayColumn`, `SwapPopover`, `AskBar` and `AgentQuestion` are client components. The rest render on the server.
- Event handlers (`onSwap`, `onAdd`, `onUndo`, `onClick`) can only be passed from a client component. Keep plan state (the stops, which card is changed, the undo stack) in one client component per screen and render the Andiamo components from it.

## Themes

Light is the default and dark follows the system setting. To force one, set `data-theme="light"` or `data-theme="dark"` on `<html>`.

## Where the values live

- Tokens and component styles: `src/app/andiamo.css`. It is generated from the Andiamo design system; change the design system and regenerate rather than hand-editing values here.
- Fonts: `src/app/fonts.ts`.
- Icons: `lucide-react`, through the `Icon` component only. To use a new icon, add it to the map in `Icon.tsx`.
