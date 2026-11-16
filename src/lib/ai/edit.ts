import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PLACE_BY_ID } from "@/lib/data/places";
import { applyEdits, type EditOp } from "@/lib/plan/edits";
import { PACES, type Plan } from "@/lib/plan/types";
import { placeViewsFor, type PlaceView } from "@/lib/plan/view";
import { formatClock, WEEKDAY_NAMES, weekdayOf } from "@/lib/time";
import { loadPrompt, render } from "./prompts";
import { CATALOG, isTimeoutError } from "./select";

const EditOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("remove"), stopKey: z.string() }),
  z.object({ op: z.literal("add"), placeId: z.string(), day: z.number().int() }),
  z.object({ op: z.literal("swap"), stopKey: z.string(), placeId: z.string() }),
  z.object({ op: z.literal("lock"), stopKey: z.string() }),
  z.object({ op: z.literal("setPace"), day: z.number().int(), pace: z.enum(PACES) }),
  z.object({ op: z.literal("ask"), question: z.string(), options: z.array(z.string()) }),
]) satisfies z.ZodType<EditOp>;

const EditOutputSchema = z.object({ ops: z.array(EditOpSchema) });

/** What the Ask box shows next: the changed plan and one sentence, a question, or why nothing changed. */
export type EditResponse =
  | { kind: "edited"; plan: Plan; places: Record<string, PlaceView>; changed: string[]; summary: string }
  | { kind: "ask"; question: string; options: string[] }
  | { kind: "refused"; reason: string }
  /** The traveller chose to keep the plan as it is. */
  | { kind: "unchanged" };

/** The traveller's answer to the agent's last question, sent with the original request. */
export interface Answer {
  question: string;
  option: string;
}

/** Thrown when the model gives no usable answer. The route reports it; the plan is left as it was. */
export class EditUnavailableError extends Error {}

const PROMPT_NAME = "edit-plan";
/** More ops than this is not "one sentence" any more. */
const MAX_OPS = 8;

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic({ maxRetries: 1, timeout: 30_000 }));

/**
 * One request from the Ask box. The model turns it into ops; code applies them. If any op fails validation the
 * reasons go back to the model once; a second failure is reported to the traveller with the first reason.
 */
export async function editPlan(plan: Plan, message: string, answer?: Answer): Promise<EditResponse> {
  const prompt = loadPrompt(PROMPT_NAME);
  const system = render(prompt.system, { catalog: CATALOG });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: render(prompt.user, { plan: JSON.stringify(describe(plan, message, answer)) }) },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await call(prompt, system, messages);
    const ops = read(response);
    if (!ops) throw new EditUnavailableError(`No usable answer (stop reason ${response.stop_reason})`);
    if (ops.length > MAX_OPS) return { kind: "refused", reason: "That's too many changes for one ask" };
    if (!ops.length && answer) return { kind: "unchanged" };

    const result = applyEdits(plan, ops);
    if (result.kind === "ask") return tidyQuestion(result.question, result.options);
    if (result.kind === "edited") {
      return { kind: "edited", plan: result.plan, places: placeViewsFor(result.plan, PLACE_BY_ID), changed: result.changed, summary: result.summary };
    }
    if (attempt === 1) return { kind: "refused", reason: result.errors[0] };
    messages.push(
      { role: "assistant", content: response.content },
      { role: "user", content: `Nothing was changed, because these failed:\n${result.errors.map((e) => `- ${e}`).join("\n")}\nReturn a corrected list of operations.` },
    );
  }
  throw new EditUnavailableError("Unreachable");
}

async function call(prompt: ReturnType<typeof loadPrompt>, system: string, messages: Anthropic.Beta.BetaMessageParam[]) {
  try {
    return await getClient().beta.messages.create({
      model: prompt.model,
      max_tokens: prompt.max_tokens,
      // A safety decline is retried on a fallback model inside the same call, instead of failing the edit.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: prompt.effort, format: betaZodOutputFormat(EditOutputSchema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    });
  } catch (error) {
    // Timeouts and unreachable hosts mean the model is unavailable, not that the request was wrong.
    if (isTimeoutError(error) || error instanceof Anthropic.APIConnectionError) throw new EditUnavailableError("Model unreachable", { cause: error });
    throw error;
  }
}

/** The ops, or null for a refusal, a cut-off reply or anything that doesn't match the schema. */
function read(response: Anthropic.Beta.BetaMessage): EditOp[] | null {
  if (response.stop_reason !== "end_turn") return null;
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return null;
  try {
    const parsed = EditOutputSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.ops : null;
  } catch {
    return null;
  }
}

/** The agent asks one short question with two to four short answers. Anything else is trimmed to fit. */
function tidyQuestion(question: string, options: string[]): EditResponse {
  const opts = [...new Set(options.map((o) => o.trim()).filter((o) => o && o.length <= 40))].slice(0, 4);
  const q = question.trim().replace(/!+/g, ".");
  if (!q || q.length > 160 || opts.length === 0) return { kind: "refused", reason: "That one needs saying another way" };
  return { kind: "ask", question: q, options: opts };
}

/** The plan as the model reads it: stop keys to point at, names, slots and times, and what the places cost. */
function describe(plan: Plan, request: string, answer?: Answer) {
  return {
    request,
    ...(answer && { earlierQuestion: answer.question, travellerAnswered: answer.option }),
    trip: { hub: plan.hub, startDate: plan.settings.startDate, days: plan.days.length, pace: plan.settings.pace, interests: plan.settings.interests },
    days: plan.days.map((d) => ({
      day: d.index + 1,
      date: d.date,
      weekday: WEEKDAY_NAMES[weekdayOf(d.date)],
      area: d.area,
      dayTrip: d.excursion,
      pace: d.pace,
      stops: d.stops.map((s) => {
        const p = s.placeId ? PLACE_BY_ID.get(s.placeId) : undefined;
        return {
          key: s.key,
          placeId: s.placeId,
          name: s.label,
          slot: s.slot,
          time: formatClock(s.start),
          ...(p && { type: p.type, price: p.priceLevel === 0 ? "free" : "€".repeat(p.priceLevel), tags: p.tags }),
          ...(s.locked && { locked: true }),
        };
      }),
    })),
    notPlanned: plan.unplaced.map((u) => ({ placeId: u.placeId, name: PLACE_BY_ID.get(u.placeId)?.name, reason: u.reason })),
    // Left out because the traveller's request ruled them out. Add one only if they ask for it by name.
    ruledOut: plan.avoided.map((u) => ({ placeId: u.placeId, name: PLACE_BY_ID.get(u.placeId)?.name, reason: u.reason })),
  };
}
