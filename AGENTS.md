<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design system: Andiamo

All UI in this app follows the Andiamo design system. Full rules: `docs/design-system.md`. Read it before building or changing any screen.

- Build from `@/components/andiamo` first. Check what exists there before writing new markup.
- Style with token utilities only: `bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `text-ink`, `text-ink-muted`, `border-line-strong`, `bg-brand`, `text-on-brand`. Tailwind's default colours are switched off. No hex values and no arbitrary colour values.
- Radius is `rounded-sm|md|lg|xl|pill`; shadows are `shadow-card|raised|overlay`; type sizes are `text-display|day-title|card-title|body|caption|label|meta|overline`; fonts are `font-display` and `font-sans`.
- Every place is shown with a `Photo`. No text-only lists of places.
- One primary `Button` per screen.
- `changed` (cobalt) marks only what the AI just altered; `warning` (amber) marks only things to check before going. Both always carry words.
- The agent speaks only through `AskBar`, `UndoBar` and `AgentQuestion`: one sentence, never a chat thread.
- Icons come from the `Icon` component (Lucide). No emoji.
- Don't hand-edit values in `src/app/andiamo.css`; it is generated from the design system.
