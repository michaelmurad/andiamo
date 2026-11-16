import { describe, expect, it } from "vitest";
import { decide, floors, runProblems } from "./compare-lib.mjs";

const config = { train_ids: ["t1", "t2", "t3", "t4"], test_ids: ["x1", "x2", "x3", "x4"], reps: 2 };
const ids = [...config.train_ids, ...config.test_ids];
type Grade = { checks: number; rubric: number; grounded: number; style: number; specific: number };
const ok: Grade = { checks: 1, rubric: 0.5, grounded: 0.9, style: 0.8, specific: 1 };

/** Two reps per case; `per` overrides grades for a case (both reps), `rep1` for rep 1 only. */
function run(sha: string, per: Record<string, Partial<Grade>> = {}, rep1: Record<string, Partial<Grade>> = {}, extra = {}) {
  return ids.flatMap((id) => [0, 1].map((rep) => ({
    prompt_id: id, rep, prompt_sha: sha, outcome: "shortlist", latency_s: 10,
    grade: { ...ok, ...per[id], ...(rep === 1 ? rep1[id] : {}) }, ...extra,
  })));
}
const costOf = () => 0.04;
// Baseline with some rep-to-rep noise on rubric in one test case.
const base = run("b", {}, { x1: { rubric: 0 } });

describe("decide", () => {
  it("keeps a round that improves test rubric beyond noise and holds everything else", () => {
    const cand = run("c", { x1: { rubric: 1 }, x2: { rubric: 1 }, x3: { rubric: 1 }, x4: { rubric: 1 } });
    expect(decide({ base, best: base, candidate: cand, config, costOf }).fail).toEqual([]);
  });

  it("reverts when test checks go down at all, even with a big rubric gain", () => {
    const cand = run("c", { x1: { rubric: 1, checks: 0 }, x2: { rubric: 1 }, x3: { rubric: 1 }, x4: { rubric: 1 } }, {});
    expect(decide({ base, best: base, candidate: cand, config, costOf }).fail).toContain("checks went down on test");
  });

  it("reverts a style-only gain: style can block a round but never win one", () => {
    const cand = run("c", { x1: { style: 1 }, x2: { style: 1 }, x3: { style: 1 }, x4: { style: 1 } });
    expect(decide({ base, best: base, candidate: cand, config, costOf }).fail).toContain("none of checks, rubric or grounded improved on test beyond noise");
  });

  it("keeps a grounded-only gain when checks and rubric hold", () => {
    // Best at grounded 0.6 everywhere; the candidate reaches 1.0, a gain of 0.4, well above the 0.125 minimum floor.
    const low = { grounded: 0.6 }, g = { grounded: 1 };
    const best = run("b", { x1: low, x2: low, x3: low, x4: low, t1: low, t2: low, t3: low, t4: low });
    const cand = run("c", { x1: g, x2: g, x3: g, x4: g, t1: g, t2: g, t3: g, t4: g });
    const out = decide({ base: best, best, candidate: cand, config, costOf });
    expect(out.fail).toEqual([]);
    expect(out.won).toEqual(["grounded"]);
  });

  it("doesn't let a grounded gain buy a rubric drop on train", () => {
    const low = { grounded: 0.6 }, g = { grounded: 1 };
    const best = run("b", { x1: low, x2: low, x3: low, x4: low });
    const cand = run("c", { x1: g, x2: g, x3: g, x4: g, t1: { rubric: 0 }, t2: { rubric: 0 } });
    const out = decide({ base: best, best, candidate: cand, config, costOf });
    expect(out.won).toEqual(["grounded"]);
    expect(out.fail).toEqual(["rubric went down on train beyond noise"]);
  });

  it("doesn't keep a test grounded gain that comes with a train grounded drop", () => {
    const low = { grounded: 0.6 }, g = { grounded: 1 }, worse = { grounded: 0.2 };
    const best = run("b", { x1: low, x2: low, x3: low, x4: low, t1: low, t2: low, t3: low, t4: low });
    const cand = run("c", { x1: g, x2: g, x3: g, x4: g, t1: worse, t2: worse, t3: worse, t4: worse });
    const out = decide({ base: best, best, candidate: cand, config, costOf });
    expect(out.won).toEqual(["grounded"]);
    expect(out.fail).toEqual(["grounded went down on train beyond noise"]);
  });

  it("reverts when one test case's grounded collapses", () => {
    const cand = run("c", { x1: { rubric: 1, grounded: 0.4 }, x2: { rubric: 1 }, x3: { rubric: 1 }, x4: { rubric: 1 } });
    expect(decide({ base, best: base, candidate: cand, config, costOf }).fail).toContain("grounded dropped by more than 0.30 in x1");
  });

  it("reverts on more shortlist failures, higher latency or higher cost", () => {
    const better = { x1: { rubric: 1 }, x2: { rubric: 1 }, x3: { rubric: 1 }, x4: { rubric: 1 } };
    const slow = run("c", better, {}, { latency_s: 20 });
    expect(decide({ base, best: base, candidate: slow, config, costOf }).fail).toContain("median latency above 1.5x");
    const pricey = decide({ base, best: base, candidate: run("c", better), config, costOf: (r: { prompt_sha: string }) => (r.prompt_sha === "c" ? 0.1 : 0.04) });
    expect(pricey.fail.join(" ")).toContain("mean cost above 1.5x");
    const failing = run("c", better).map((r, i) => (i === 0 ? { ...r, outcome: "no shortlist (timeout)" } : r));
    expect(decide({ base, best: base, candidate: failing, config, costOf }).fail.join(" ")).toContain("more rows without a shortlist");
  });

  it("reverts when train goes down beyond its own floor", () => {
    const cand = run("c", { x1: { rubric: 1 }, x2: { rubric: 1 }, x3: { rubric: 1 }, x4: { rubric: 1 }, t1: { checks: 0 }, t2: { checks: 0 } });
    expect(decide({ base, best: base, candidate: cand, config, costOf }).fail).toContain("checks went down on train beyond noise");
  });
});

describe("noise-floor boundary at the real split size", () => {
  it("never keeps a one-rep flip with 9 test and 13 train cases (fails without the float margin)", () => {
    const test = Array.from({ length: 9 }, (_, i) => `x${i}`), train = Array.from({ length: 13 }, (_, i) => `t${i}`);
    const cfg = { test_ids: test, train_ids: train };
    const all = [...train, ...test];
    const rows = (failing: string[], fixed: string | null) => all.flatMap((id) => [0, 1].map((rep) => ({
      prompt_id: id, rep, prompt_sha: "s", outcome: "shortlist", latency_s: 10,
      grade: { ...ok, checks: failing.includes(id) && !(id === fixed && rep === 1) ? 0 : 1 },
    })));
    for (let k = 1; k <= 9; k++) for (let f = 0; f < k; f++) {
      const failing = test.slice(0, k);
      const best = rows(failing, null);
      expect(decide({ base: best, best, candidate: rows(failing, test[f]), config: cfg, costOf }).fail.length).toBeGreaterThan(0);
    }
  });
});

describe("noise-floor boundary", () => {
  it("doesn't keep a round whose only gain is one rep flipping in one case (float rounding can't decide it)", () => {
    // Best fails checks in two test cases on both reps; the candidate fixes one rep of one case. Delta equals the floor.
    const fails = { x1: { checks: 0 }, x2: { checks: 0 } };
    const best = run("b", fails);
    const cand = run("c", fails, { x1: { checks: 1 } });
    for (const n of [4]) expect(config.test_ids.length).toBe(n);
    expect(decide({ base: best, best, candidate: cand, config, costOf }).fail).toContain("none of checks, rubric or grounded improved on test beyond noise");
  });
});

describe("floors", () => {
  it("never go below one rep flipping in one case", () => {
    const f = floors(run("b"), config.test_ids) as Record<string, number>;
    expect(f.checks).toBeCloseTo(0.5 / 4);
  });
});

describe("runProblems", () => {
  it("rejects mixed prompts, missing reps and unscored attempts", () => {
    const mixed = run("a").map((r, i) => (i === 0 ? { ...r, prompt_sha: "z" } : r));
    expect(runProblems("v1", mixed, ids, 2, 0).join(" ")).toContain("2 prompt versions");
    expect(runProblems("v1", run("a").slice(1), ids, 2, 0).join(" ")).toContain("has 1 reps");
    expect(runProblems("v1", run("a"), ids, 2, 3).join(" ")).toContain("3 failed attempts");
    expect(runProblems("v1", run("a"), ids, 2, 0)).toEqual([]);
  });
});
