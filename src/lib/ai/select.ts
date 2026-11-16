import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { PLACE_BY_ID, PLACES } from "@/lib/data/places";
import { HUBS, type Hub } from "@/lib/data/types";
import type { ShortlistPick, TripSettings } from "@/lib/plan/types";
import { loadPrompt, render, type Prompt } from "./prompts";

const SelectionSchema = z.object({
  hub: z.enum(HUBS),
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
});

export interface Selection {
  hub: Hub;
  picks: ShortlistPick[];
  /** Ids the model returned that aren't in the dataset. Dropped, but counted so we can see it happen. */
  unknownIds: string[];
  /** e.g. "select-places@2": which prompt produced this, for evals and debugging. */
  prompt: string;
}

/** One line per plannable place. Stable across requests, so it sits in the cached system prompt. */
const CATALOG = PLACES.filter((p) => p.autoPlan)
  .map((p) =>
    [p.id, p.name, p.type, p.excursion ? `${p.hub} (day trip: ${p.excursion.zone})` : p.hub, p.tags.join(","),
      p.priceLevel === 0 ? "free" : "€".repeat(p.priceLevel), p.rating, p.description].join(" | "),
  )
  .join("\n");

/** The prompt text and model settings live in /prompts/select-places.yaml, so they can be versioned and evaluated. */
const PROMPT_NAME = "select-places";

/** Rendered on first use per prompt version, so a broken prompt file fails the request (and falls back), not the route. */
const systems = new Map<string, string>();
const getSystem = (prompt: Prompt) => {
  const key = `${prompt.id}@${prompt.version}`;
  if (!systems.has(key)) systems.set(key, render(prompt.system, { catalog: CATALOG }));
  return systems.get(key)!;
};

/** Created on first use, so a missing credential becomes a failed request (and the fallback), not a crash at import. */
let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic({ maxRetries: 1, timeout: 30_000 }));

export type SelectionOutput = z.infer<typeof SelectionSchema>;

/**
 * Reads structured output without throwing. The SDK's parse helper throws on invalid or cut-off JSON, which
 * would hide a bad response behind an exception; here it becomes null, like any other unusable answer.
 */
export function parseOutput<T extends z.ZodType>(response: Anthropic.Message, schema: T): z.infer<T> | null {
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return null;
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** One model call, with everything an eval needs to grade it and price it. */
export interface SelectCall {
  output: SelectionOutput | null;
  model: string;
  usage: Anthropic.Usage;
  /** "timeout" when the request hit the client's timeout; production then plans without the model. */
  stopReason: Anthropic.Message["stop_reason"] | "timeout";
  prompt: Prompt;
  system: string;
  user: string;
}

/** The raw model call. Production goes through selectPlaces; the eval calls this, then toSelection. */
export async function callSelectModel(settings: TripSettings, notes: string, prompt = loadPrompt(PROMPT_NAME)): Promise<SelectCall> {
  const system = getSystem(prompt);
  const user = render(prompt.user, { request: JSON.stringify({ ...settings, notes }) });
  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: prompt.model,
      max_tokens: prompt.max_tokens,
      output_config: { effort: prompt.effort, format: zodOutputFormat(SelectionSchema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
  } catch (error) {
    // A timeout is an answer about this prompt (too slow), not an infrastructure fault: report it as a call
    // with no shortlist, so callers (production's fallback, the eval's scoring) treat it like any unusable reply.
    if (!isTimeoutError(error)) throw error;
    return { output: null, model: prompt.model, usage: EMPTY_USAGE, stopReason: "timeout", prompt, system, user };
  }
  return {
    output: response.stop_reason === "end_turn" ? parseOutput(response, SelectionSchema) : null,
    model: response.model,
    usage: response.usage,
    stopReason: response.stop_reason,
    prompt,
    system,
    user,
  };
}

const EMPTY_USAGE = { input_tokens: 0, output_tokens: 0 } as Anthropic.Usage;

/**
 * True for the SDK's request-timeout error. Checked by name as well as class: code loaded through different
 * module systems can hold two copies of the SDK, and `instanceof` fails across them.
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof Anthropic.APIConnectionTimeoutError || (error as { name?: string } | null)?.name === "APIConnectionTimeoutError";
}

/** Validates the model's output against the dataset. The same code path in production and in the eval. */
export function toSelection(settings: TripSettings, call: SelectCall): Selection | null {
  if (!call.output) return null;
  const { hub, picks } = call.output;
  const known = picks.filter((p) => PLACE_BY_ID.has(p.id));
  return {
    hub: settings.hub ?? hub,
    // The prompt forbids timing claims; this enforces it. A reason that slips through is blanked, and the
    // scheduler falls back to the place's own description. The pick and its rank are kept.
    picks: known.map((p) => (mentionsTiming(p.reason, PLACE_BY_ID.get(p.id)!.name) ? { ...p, reason: "" } : p)),
    unknownIds: picks.filter((p) => !PLACE_BY_ID.has(p.id)).map((p) => p.id),
    prompt: `${call.prompt.id}@${call.prompt.version}`,
  };
}

/**
 * Asks the model for a hub and a ranked shortlist. Returns null on any failure (no credentials, timeout,
 * refusal, unparseable output), and the caller plans without it.
 */
export async function selectPlaces(settings: TripSettings, notes: string): Promise<Selection | null> {
  return toSelection(settings, await callSelectModel(settings, notes));
}

const TIMING = new RegExp(
  [
    String.raw`\b(mon|tues?|wednes|thurs?|fri|satur|sun)day`,
    String.raw`\bweekends?\b`,
    String.raw`\b(morning|afternoon|evening|night|dusk|dawn|sunrise|sunset|noon|midday)s?\b`,
    String.raw`\b(tonight|tomorrow|today|nightly|nightlife|night-?time|late-night|after dark|bedtime|sundowners?)\b`,
    String.raw`\b(breakfast|brunch|lunch|dinner|supper)(e?s)?\b`,
    String.raw`\baperitiv[oi]\b`,
    String.raw`\b(lunchtime|dinnertime|suppertime|teatime|midnight|overnight|weekdays?|weeknights?|golden hour|twilight|day[- ]?break)\b`,
    String.raw`\bfirst[- ]light\b(?!-)`,
    String.raw`\b\d{1,2}(:\d{2})?\s?[ap]\.m\b`,
    String.raw`\b[ap]\.m\.`,
    String.raw`\b\d{1,2}(:\d{2})?\s?(am|pm)\b`,
    String.raw`\b\d{1,2}:\d{2}\b`,
  ].join("|"),
  "gi",
);

/**
 * Does a reason claim a day, a time or a meal? Those are the scheduler's call, so the model mustn't promise them.
 * Words from the place's own name are allowed: "Trevi Fountain by Night" is only ever planned at night.
 */
export function mentionsTiming(reason: string, placeName = ""): boolean {
  const allowed = new Set([...placeName.matchAll(TIMING)].map((m) => m[0].toLowerCase()));
  return [...reason.matchAll(TIMING)].some((m) => !allowed.has(m[0].toLowerCase()));
}
