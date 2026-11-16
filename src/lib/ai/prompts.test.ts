import { describe, expect, it } from "vitest";
import { loadPrompt, parsePrompt, render } from "./prompts";

describe("prompts/select-places.yaml", () => {
  const prompt = loadPrompt("select-places");

  it("is valid", () => {
    expect(prompt).toMatchObject({ id: "select-places", model: "claude-opus-5-5" });
    expect(prompt.version).toBeGreaterThan(0);
  });

  it("uses exactly the placeholders select.ts fills", () => {
    const placeholders = (t: string) => [...t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
    expect(placeholders(prompt.system)).toEqual(["catalog"]);
    expect(placeholders(prompt.user)).toEqual(["request"]);
  });

  it("keeps the rule that reasons never promise a time", () => {
    expect(prompt.system).toContain("Never mention a day of the week");
  });
});

describe("render", () => {
  it("fills placeholders, with or without spaces", () => {
    expect(render("a {{x}} b {{ y }}", { x: "1", y: "2" })).toBe("a 1 b 2");
  });

  it("throws on a placeholder with no value", () => {
    expect(() => render("{{missing}}", {})).toThrow("No value for {{missing}}");
  });
});

describe("parsePrompt", () => {
  it("names the field that's wrong", () => {
    expect(() => parsePrompt("id: x\nversion: 1\nmodel: m\neffort: extreme\nmax_tokens: 10\nsystem: s\nuser: u\n")).toThrow(/effort/);
  });
});
