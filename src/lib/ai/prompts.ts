import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/** The shape of a prompt file in /prompts. Text and model settings live together so an eval can load one file. */
export const PromptSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  model: z.string().min(1),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  max_tokens: z.number().int().positive(),
  system: z.string().min(1),
  user: z.string().min(1),
});
export type Prompt = z.infer<typeof PromptSchema>;

/** Prompt files sit at the project root, so the route that reads them must list them in next.config.ts. */
export const PROMPTS_DIR = path.join(process.cwd(), "prompts");

const cache = new Map<string, Prompt>();

/** Reads and validates /prompts/<name>.yaml. Cached: the file is read once per server instance. */
export function loadPrompt(name: string, dir = PROMPTS_DIR): Prompt {
  // turbopackIgnore: the path is dynamic, which would make Next trace the whole project into the server
  // bundle. next.config.ts lists the prompt files explicitly instead.
  const file = path.join(/* turbopackIgnore: true */ dir, `${name}.yaml`);
  const cached = cache.get(file);
  if (cached) return cached;
  const prompt = parsePrompt(readFileSync(file, "utf8"), name);
  cache.set(file, prompt);
  return prompt;
}

export function parsePrompt(source: string, name = "prompt"): Prompt {
  const result = PromptSchema.safeParse(parse(source));
  if (!result.success) throw new Error(`Invalid prompt ${name}: ${z.prettifyError(result.error)}`);
  return result.data;
}

/** Fills {{name}} placeholders. A placeholder with no value is a bug, so it throws instead of sending "{{x}}". */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    if (!(name in vars)) throw new Error(`No value for {{${name}}}`);
    return vars[name];
  });
}
