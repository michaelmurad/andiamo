import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { parsePrompt, render } from "@/lib/ai/prompts";
import { mentionsTiming, parseOutput, type SelectCall } from "@/lib/ai/select";
import { PLACE_BY_ID } from "@/lib/data/places";
import { HUBS, PLACE_TYPES } from "@/lib/data/types";
import { TripSettingsSchema } from "@/lib/plan/settings";
import type { TripSettings } from "@/lib/plan/types";

const PlaceId = z.string().regex(/^place_\d{3}$/).refine((id) => PLACE_BY_ID.has(id), "unknown place id");

const ConstraintsSchema = z.strictObject({
  include_any: z.array(PlaceId).min(1).optional(),
  exclude_ids: z.array(PlaceId).optional(),
  exclude_types: z.array(z.enum(PLACE_TYPES)).optional(),
  exclude_tags: z.array(z.string()).optional(),
  max_price_share: z.strictObject({ level: z.number().int().min(0).max(4), share: z.number().min(0).max(1) }).optional(),
  hub_in: z.array(z.enum(HUBS)).min(1).optional(),
});
type Constraints = z.infer<typeof ConstraintsSchema>;

const CaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  tags: z.array(z.string()).min(1),
  settings: z.record(z.string(), z.unknown()),
  notes: z.string(),
  constraints: ConstraintsSchema.optional(),
  rubric: z.array(z.string().min(1)).min(1),
});

const CasesFileSchema = z.strictObject({
  defaults: z.record(z.string(), z.unknown()),
  cases: z.array(CaseSchema).min(1),
});

export interface EvalCase {
  id: string;
  tags: string[];
  settings: TripSettings;
  notes: string;
  constraints: Constraints;
  rubric: string[];
  /** One readable line for the report's prompt column. */
  prompt: string;
}

/** Loads cases.yaml, merges each case over the defaults and validates it exactly as the API would. */
export function loadCases(file: string): EvalCase[] {
  const raw = CasesFileSchema.parse(parse(readFileSync(file, "utf8")));
  return raw.cases.map((c) => {
    const settings = TripSettingsSchema.parse({ ...raw.defaults, ...c.settings });
    const prompt = [
      settings.hub ?? "Pick for me",
      settings.interests.join(", ") || "no interests",
      settings.pace,
      ...(settings.maxPrice !== 3 ? [`max ${"€".repeat(settings.maxPrice)}`] : []),
      ...(settings.avoidCrowds ? ["avoid crowds"] : []),
      ...(c.notes ? [`"${c.notes}"`] : []),
    ].join(" · ");
    return { id: c.id, tags: c.tags, settings, notes: c.notes, constraints: c.constraints ?? {}, rubric: c.rubric, prompt };
  });
}

/**
 * The loop may edit only prompts/select-places.yaml. This rejects edits that would win by reading the answer
 * key instead of improving the planner: place ids or names, or any case's notes or rubric text, in the prompt;
 * a model other than the locked one; or a dropped placeholder.
 */
export function lintPrompt(prompt: { model: string; system: string; user: string }, cases: EvalCase[], lockedModel: string): string[] {
  const text = `${prompt.system}\n${prompt.user}`;
  const lower = text.toLowerCase();
  const problems: string[] = [];
  if (prompt.model !== lockedModel) problems.push(`model is ${prompt.model}; the loop may not change it from ${lockedModel}`);
  if (!/\{\{\s*catalog\s*\}\}/.test(prompt.system)) problems.push("system text is missing {{catalog}}");
  if (!/\{\{\s*request\s*\}\}/.test(prompt.user)) problems.push("user text is missing {{request}}");
  const ids = text.match(/place_\d{3}/g);
  if (ids) problems.push(`contains place ids: ${[...new Set(ids)].join(", ")}`);
  for (const place of PLACE_BY_ID.values()) {
    if (lower.includes(place.name.toLowerCase())) problems.push(`names a place: ${place.name}`);
  }
  for (const c of cases) {
    if (c.notes && lower.includes(c.notes.toLowerCase())) problems.push(`contains case ${c.id}'s notes`);
    for (const line of c.rubric) if (lower.includes(line.toLowerCase())) problems.push(`contains a rubric line from ${c.id}`);
  }
  return problems;
}

/** Metric order matters: the report's headline is the first binary metric. */
export const METRICS = [
  { id: "checks", label: "All checks", kind: "binary" },
  { id: "rubric", label: "Rubric", kind: "float", scale: 1 },
  { id: "grounded", label: "Grounded", kind: "float", scale: 1 },
  { id: "style", label: "Reason style", kind: "float", scale: 1 },
  { id: "specific", label: "Specific", kind: "float", scale: 1 },
  { id: "valid_ids", label: "Valid ids", kind: "binary" },
  { id: "in_hub", label: "In hub", kind: "binary" },
  { id: "hub_ok", label: "Hub ok", kind: "binary" },
  { id: "count_ok", label: "10–15 picks", kind: "binary" },
  { id: "no_timing", label: "No timing", kind: "binary" },
  { id: "constraints", label: "Constraints", kind: "binary" },
] as const;

const MIN_PICKS = 10;
const MAX_PICKS = 15;
const MAX_REASON_WORDS = 14;

/** Words that say nothing about a particular place, plus the hub and satellite town names. */
const GENERIC = new Set(
  ("about after also before best between beyond centre center city each even every from good great have here "
    + "italian italy just like local made make more most much only other over place places really same should "
    + "since some than that their them then there these they this those through very visit want well what when "
    + "where which while with without worth would your yours rome florence milan venice bologna modena parma "
    + "siena pienza como").split(" "),
);
const contentWords = (text: string) =>
  (text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => !GENERIC.has(w)).map((w) => w.slice(0, 5));

/**
 * Does the reason mention something distinctive from the place's own description, beyond its name? A reason
 * with no checkable content can't be ungrounded, so `grounded` alone would reward saying nothing; this is the
 * counterweight. Matching is on 5-letter word stems so "painting" matches "paintings".
 */
export function isSpecific(reason: string, place: { name: string; description: string }): boolean {
  const nameWords = new Set(contentWords(place.name));
  const described = new Set(contentWords(place.description).filter((w) => !nameWords.has(w)));
  return contentWords(reason).some((w) => described.has(w));
}

/** What the prompt asks of each reason: present, at most 14 words, in the second person. */
export function reasonStyleProblem(reason: string): string | null {
  const words = reason.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return "empty";
  if (words > MAX_REASON_WORDS) return `${words} words`;
  if (!/\byou(r|rs|rself|rselves)?\b/i.test(reason)) return "not second person";
  return null;
}

/** Free, deterministic checks on the raw model output (before production's guard blanks anything). */
export function codeChecks(c: EvalCase, call: SelectCall) {
  const grade: Record<string, number> = {};
  const why: Record<string, string> = {};
  const set = (id: string, ok: boolean, failure: string) => {
    grade[id] = ok ? 1 : 0;
    if (!ok) why[id] = failure;
  };

  if (!call.output) {
    for (const m of ["valid_ids", "in_hub", "hub_ok", "count_ok", "no_timing", "constraints"]) set(m, false, `No parsed output (stop_reason: ${call.stopReason})`);
    grade.style = 0;
    grade.specific = 0;
    return { grade, why, hub: null };
  }
  const { picks } = call.output;
  const hub = c.settings.hub ?? call.output.hub;
  const places = [...new Map(picks.flatMap((p) => { const place = PLACE_BY_ID.get(p.id); return place ? [[p.id, place] as const] : []; })).values()];

  const invalid = picks.filter((p) => !PLACE_BY_ID.get(p.id)?.autoPlan).map((p) => p.id);
  const duplicates = picks.map((p) => p.id).filter((id, i, ids) => ids.indexOf(id) !== i);
  set("valid_ids", invalid.length === 0 && duplicates.length === 0, [
    ...(invalid.length ? [`Unknown or unplannable: ${invalid.join(", ")}`] : []),
    ...(duplicates.length ? [`Repeated: ${[...new Set(duplicates)].join(", ")}`] : []),
  ].join("; "));
  // The scheduler plans each place once, so repeated ids don't count towards the shortlist.
  const unique = new Set(picks.map((p) => p.id)).size;

  const outside = places.filter((p) => p.hub !== hub).map((p) => `${p.name} (${p.hub})`);
  set("in_hub", outside.length === 0, `Outside ${hub}: ${outside.join(", ")}`);

  const hubProblems = [
    ...(c.settings.hub && call.output.hub !== c.settings.hub ? [`chose ${call.output.hub}, traveller chose ${c.settings.hub}`] : []),
    ...(c.constraints.hub_in && !c.constraints.hub_in.includes(hub) ? [`${hub} is not one of ${c.constraints.hub_in.join(", ")}`] : []),
  ];
  set("hub_ok", hubProblems.length === 0, hubProblems.join("; "));

  set("count_ok", unique >= MIN_PICKS && picks.length <= MAX_PICKS, `${unique} distinct picks of ${picks.length}`);

  const timing = picks.filter((p) => mentionsTiming(p.reason, PLACE_BY_ID.get(p.id)?.name)).map((p) => `${p.id}: "${p.reason}"`);
  set("no_timing", timing.length === 0, timing.join(" | "));

  const broken = constraintFailures(c.constraints, places, hub);
  set("constraints", broken.length === 0, broken.join("; "));

  // A share, not pass/fail: one long reason shouldn't score the same as fifteen.
  const styleProblems = picks.flatMap((p) => {
    const problem = reasonStyleProblem(p.reason);
    return problem ? [`${p.id} (${problem}): "${p.reason}"`] : [];
  });
  grade.style = picks.length ? 1 - styleProblems.length / picks.length : 0;
  if (styleProblems.length) why.style = styleProblems.join(" | ");

  const vague = picks.filter((p) => {
    const place = PLACE_BY_ID.get(p.id);
    return !place || !isSpecific(p.reason, place);
  });
  grade.specific = picks.length ? 1 - vague.length / picks.length : 0;
  if (vague.length) why.specific = vague.map((p) => `${p.id}: "${p.reason}"`).join(" | ");

  return { grade, why, hub };
}

function constraintFailures(k: Constraints, places: NonNullable<ReturnType<typeof PLACE_BY_ID.get>>[], hub: string): string[] {
  const ids = new Set(places.map((p) => p.id));
  const name = (id: string) => PLACE_BY_ID.get(id)?.name ?? id;
  const out: string[] = [];
  if (k.include_any && !k.include_any.some((id) => ids.has(id))) out.push(`none of: ${k.include_any.map(name).join(", ")}`);
  for (const id of k.exclude_ids ?? []) if (ids.has(id)) out.push(`picked excluded ${name(id)}`);
  for (const p of places) if (k.exclude_types?.includes(p.type)) out.push(`picked a ${p.type}: ${p.name}`);
  for (const p of places) for (const t of k.exclude_tags ?? []) if (p.tags.includes(t)) out.push(`picked ${t}: ${p.name}`);
  if (k.max_price_share) {
    const cheap = places.filter((p) => p.priceLevel <= k.max_price_share!.level).length;
    const share = places.length ? cheap / places.length : 0;
    if (share < k.max_price_share.share) out.push(`${Math.round(share * 100)}% at ≤${"€".repeat(k.max_price_share.level) || "free"}, need ${k.max_price_share.share * 100}%`);
  }
  if (k.hub_in && !k.hub_in.includes(hub as never)) out.push(`hub ${hub}`);
  return out;
}

const VerdictsSchema = z.object({
  verdicts: z.array(z.object({ statement: z.number().int(), pass: z.boolean(), reason: z.string() })).min(1),
  grounding: z.array(
    z.object({
      rank: z.number().int(),
      claims: z.array(z.object({ claim: z.string(), kind: z.enum(["fact", "opinion"]), status: z.enum(["stated", "inferred", "unsupported"]) })),
    }),
  ).min(1),
});

const JUDGE = parsePrompt(readFileSync(new URL("./judge.yaml", import.meta.url), "utf8"), "judge");
let client: Anthropic | undefined;

/**
 * Sonnet marks each rubric statement, and whether each reason is supported by that place's description.
 * Throws (an error row, not a zero) if the verdicts don't line up with the statements and picks.
 */
export async function judge(c: EvalCase, call: SelectCall, hub: string) {
  const picks = call.output!.picks.map((p, i) => {
    const place = PLACE_BY_ID.get(p.id);
    if (!place) return `#${i + 1} ${p.id}: not in the dataset\n   Reason: ${p.reason}`;
    const price = place.priceLevel === 0 ? "free" : "€".repeat(place.priceLevel);
    const trip = place.excursion ? `, day trip from ${place.hub} (${place.excursion.zone})` : "";
    return [
      `#${i + 1} ${place.name} (${p.id}): ${place.type}, ${place.neighborhood ? `${place.neighborhood}, ` : ""}${place.city}${trip}, ${price}, rated ${place.rating}, tags ${place.tags.join(", ")}`,
      `   Description: ${place.description}`,
      `   Reason: ${p.reason}`,
    ].join("\n");
  });
  const user = render(JUDGE.user, {
    request: JSON.stringify({ ...c.settings, notes: c.notes }),
    hub,
    picks: picks.join("\n\n"),
    rubric: c.rubric.map((r, i) => `${i + 1}. ${r}`).join("\n"),
  });

  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });

  // The judge occasionally returns an incomplete set of verdicts. Ask once more before calling it a grader
  // error; both attempts are billed, so their usage is summed.
  let usage: Anthropic.Usage | undefined;
  let lastError = "";
  for (let attempt = 1; attempt <= JUDGE_ATTEMPTS; attempt++) {
    const response = await client.messages.create({
      model: JUDGE.model,
      max_tokens: JUDGE.max_tokens,
      output_config: { effort: JUDGE.effort, format: zodOutputFormat(VerdictsSchema) },
      system: JUDGE.system,
      messages: [{ role: "user", content: user }],
    });
    usage = addUsage(usage, response.usage);
    const parsed = response.stop_reason === "end_turn" ? parseOutput(response, VerdictsSchema) : null;
    const checked = parsed && lineUp(c, call, parsed);
    if (checked && checked.verdicts) return finish(c, call, user, response.model, usage, parsed, checked);
    lastError = checked?.error ?? `judge stop_reason ${response.stop_reason}`;
    if (attempt === JUDGE_ATTEMPTS) {
      throw Object.assign(new Error(`${lastError} (after ${attempt} attempts)`), { failure_class: "grader_error", judge_model: response.model, judge_usage: usage });
    }
  }
  throw new Error("unreachable");
}

const JUDGE_ATTEMPTS = 2;

type Verdicts = z.infer<typeof VerdictsSchema>;

function addUsage(a: Anthropic.Usage | undefined, b: Anthropic.Usage): Anthropic.Usage {
  if (!a) return b;
  return {
    ...b,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
  };
}

/** Matches the judge's verdicts to rubric statements and grounding to picks, or says what's missing. */
function lineUp(c: EvalCase, call: SelectCall, parsed: Verdicts) {
  const byStatement = new Map(parsed.verdicts.map((v) => [v.statement, v]));
  const verdicts = c.rubric.map((_, i) => byStatement.get(i + 1));
  if (verdicts.some((v) => !v)) return { error: `judge returned ${byStatement.size} verdicts for ${c.rubric.length} statements` };
  const nPicks = call.output!.picks.length;
  const byRank = new Map(parsed.grounding.map((g) => [g.rank, g]));
  const grounding = call.output!.picks.map((_, i) => byRank.get(i + 1));
  if (grounding.some((g) => !g)) return { error: `judge graded grounding for ${byRank.size} of ${nPicks} picks` };
  const unread = call.output!.picks.filter((p, i) => p.reason.trim() && grounding[i]!.claims.length === 0).length;
  if (unread) return { error: `judge listed no claims for ${unread} non-empty reason(s)` };
  return { verdicts: verdicts.map((v) => v!), grounding: grounding.map((g) => g!) };
}

function finish(
  c: EvalCase,
  call: SelectCall,
  user: string,
  model: string,
  usage: Anthropic.Usage,
  parsed: Verdicts,
  { verdicts, grounding }: { verdicts: Verdicts["verdicts"]; grounding: Verdicts["grounding"] },
) {
  const nPicks = call.output!.picks.length;
  // A pick is grounded when none of its factual claims is unsupported. Opinions are never held against it.
  const badClaims = grounding.map((g) => g.claims.filter((k) => k.kind === "fact" && k.status === "unsupported").map((k) => k.claim));
  const unsupported = badClaims.flatMap((claims, i) =>
    claims.length ? [`#${i + 1} ${call.output!.picks[i].id}: ${claims.join("; ")}`] : [],
  );

  const passed = verdicts.filter((v) => v.pass).length;
  return {
    score: passed / c.rubric.length,
    grounded: nPicks ? 1 - unsupported.length / nPicks : 0,
    groundingExplanation: unsupported.join("\n"),
    /** Per pick, in shortlist order: the judge's grounding call. Used by calibration. */
    groundingByPick: badClaims.map((claims, i) => ({ id: call.output!.picks[i].id, supported: claims.length === 0, claim: claims.join("; ") })),
    explanation: verdicts.map((v, i) => `${v.pass ? "✓" : "✗"} ${c.rubric[i]} — ${v.reason}`).join("\n"),
    judge_model: model,
    judge_usage: usage,
    transcript: [
      { role: "user", content: user },
      { role: "assistant", content: JSON.stringify(parsed, null, 2) },
    ],
  };
}
