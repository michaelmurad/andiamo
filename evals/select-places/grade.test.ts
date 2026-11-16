import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPrompt } from "@/lib/ai/prompts";
import type { SelectCall } from "@/lib/ai/select";
import { PLACES } from "@/lib/data/places";
import { HUBS, type Hub } from "@/lib/data/types";
import { codeChecks, isSpecific, lintPrompt, loadCases, type EvalCase } from "./grade";

const CASES = loadCases(fileURLToPath(new URL("./cases.yaml", import.meta.url)));
const LOCKBOX = loadCases(fileURLToPath(new URL("./lockbox.yaml", import.meta.url)));
const PROMPT = loadPrompt("select-places");

const call = (output: SelectCall["output"], stopReason: SelectCall["stopReason"] = "end_turn"): SelectCall => ({
  output,
  stopReason,
  model: PROMPT.model,
  usage: { input_tokens: 1, output_tokens: 1 } as SelectCall["usage"],
  prompt: PROMPT,
  system: "",
  user: "",
});

/** A shortlist built to satisfy every code check for a case. If one can't be built, the case is impossible. */
function oracle(c: EvalCase): SelectCall["output"] {
  const k = c.constraints;
  const hub: Hub = c.settings.hub ?? k.hub_in?.[0] ?? "Rome";
  const allowed = PLACES.filter(
    (p) =>
      p.hub === hub &&
      p.autoPlan &&
      !k.exclude_ids?.includes(p.id) &&
      !k.exclude_types?.includes(p.type) &&
      !p.tags.some((t) => k.exclude_tags?.includes(t)),
  ).sort((a, b) => a.priceLevel - b.priceLevel); // cheapest first, for price-share cases
  const first = allowed.filter((p) => k.include_any?.includes(p.id)).slice(0, 1);
  const picks = [...first, ...allowed.filter((p) => !first.includes(p))].slice(0, 10);
  return { hub, picks: picks.map((p) => ({ id: p.id, reason: specificReason(p) })) };
}

/** "You get the <word>." using the first description word that makes the reason specific. */
function specificReason(p: { name: string; description: string }): string {
  const word = (p.description.match(/\p{L}{5,}/gu) ?? []).find((w) => isSpecific(`You get the ${w}.`, p));
  if (!word) throw new Error(`no specific word for ${p.name}`);
  return `You get the ${word.toLowerCase()}.`;
}

describe("cases.yaml", () => {
  it("loads, with unique ids", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  it.each([...CASES, ...LOCKBOX].map((c) => [c.id, c] as const))("%s: a perfect shortlist exists and passes every check", (_, c) => {
    const { grade, why } = codeChecks(c, call(oracle(c)));
    expect(why).toEqual({});
    expect(Object.values(grade).every((v) => v === 1)).toBe(true);
  });
});

describe("codeChecks fails what it should", () => {
  const c = CASES.find((x) => x.id === "no-museums")!;
  const good = oracle(c)!;

  it("no output at all fails every check", () => {
    const { grade } = codeChecks(c, call(null, "refusal"));
    expect(Object.values(grade).every((v) => v === 0)).toBe(true);
  });

  it("an empty shortlist fails the count", () => {
    expect(codeChecks(c, call({ hub: good.hub, picks: [] })).grade.count_ok).toBe(0);
  });

  it("an invented id fails valid_ids", () => {
    const out = { ...good, picks: [...good.picks.slice(1), { id: "place_999", reason: "x" }] };
    expect(codeChecks(c, call(out)).grade.valid_ids).toBe(0);
  });

  it("Hard Rock Cafe (in the dataset, never planned) fails valid_ids", () => {
    const out = { ...good, picks: [...good.picks.slice(1), { id: "place_025", reason: "x" }] };
    expect(codeChecks(c, call(out)).grade.valid_ids).toBe(0);
  });

  it("repeated ids fail valid_ids and don't count towards the shortlist", () => {
    const seven = good.picks.slice(0, 7);
    const { grade, why } = codeChecks(c, call({ ...good, picks: [...seven, ...seven] }));
    expect(grade.valid_ids).toBe(0);
    expect(grade.count_ok).toBe(0);
    expect(why.count_ok).toBe("7 distinct picks of 14");
  });

  it("a place from another hub fails in_hub", () => {
    const out = { ...good, picks: [...good.picks.slice(1), { id: "place_056", reason: "x" }] };
    expect(codeChecks(c, call(out)).grade.in_hub).toBe(0);
  });

  it("switching away from the traveller's hub fails hub_ok", () => {
    const other = HUBS.find((h) => h !== c.settings.hub)!;
    expect(codeChecks(c, call({ ...good, hub: other })).grade.hub_ok).toBe(0);
  });

  it("a timing claim fails no_timing", () => {
    const out = { ...good, picks: [{ ...good.picks[0], reason: "Perfect for a lazy Sunday lunch." }, ...good.picks.slice(1)] };
    expect(codeChecks(c, call(out)).grade.no_timing).toBe(0);
  });

  it("scores reason style as the share of reasons that are short and second person", () => {
    const out = {
      ...good,
      picks: [
        { ...good.picks[0], reason: "Ancient ruins and the best view over the city." },
        { ...good.picks[1], reason: "" },
        ...good.picks.slice(2),
      ],
    };
    const { grade, why } = codeChecks(c, call(out));
    expect(grade.style).toBeCloseTo(1 - 2 / out.picks.length);
    expect(why.style).toContain("not second person");
    expect(why.style).toContain("empty");
  });

  it("a reason that only restates the name isn't specific", () => {
    const place = { name: "Colosseum", description: "The most iconic structure in Rome. The underground and arena floor access is worth it." };
    expect(isSpecific("Rome's essential monument, a must on any trip.", place)).toBe(false);
    expect(isSpecific("You can walk the arena floor.", place)).toBe(true);
    expect(isSpecific("Suits you: Colosseum.", place)).toBe(false);
  });

  it("a museum on the no-museums trip fails constraints", () => {
    const out = { ...good, picks: [...good.picks.slice(1), { id: "place_010", reason: "x" }] };
    const { grade, why } = codeChecks(c, call(out));
    expect(grade.constraints).toBe(0);
    expect(why.constraints).toContain("Vatican Museums");
  });
});

describe("lintPrompt", () => {
  const all = [...CASES, ...LOCKBOX];
  const ok = { model: "claude-opus-5-5", system: PROMPT.system, user: PROMPT.user };

  it("passes the current prompt", () => {
    expect(lintPrompt(ok, all, "claude-opus-5-5")).toEqual([]);
  });

  it.each([
    ["a place id", { ...ok, system: ok.system + "\nNever pick place_027." }, "place ids"],
    ["a place name", { ...ok, system: ok.system + "\nFor limited mobility, avoid Boboli Gardens." }, "Boboli Gardens"],
    ["a case's notes", { ...ok, system: ok.system + "\nIf they say: We're both vegetarian." }, "vegetarian's notes"],
    ["a rubric line", { ...ok, system: ok.system + "\n" + CASES[0].rubric[0] }, "rubric line"],
    ["another model", { ...ok, model: "claude-sonnet-5-5" }, "may not change"],
    ["no catalog", { ...ok, system: "Plan a trip." }, "{{catalog}}"],
    ["no request", { ...ok, user: "Hi." }, "{{request}}"],
  ])("rejects %s", (_, prompt, problem) => {
    expect(lintPrompt(prompt, all, "claude-opus-5-5").join(" | ")).toContain(problem);
  });
});
