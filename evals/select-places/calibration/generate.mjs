#!/usr/bin/env node
// Generates fresh shortlists for the calibration-only trips in calibration/cases.yaml, using the production
// model call, and saves them in the eval's results/traces shape so calibrate.mjs can judge them.
//
//   npm run eval:calibrate -- --generate
// (wired through calibrate.mjs; writes .claude/hillclimb/select-places/calibration-fresh/)

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callSelectModel } from '../../../src/lib/ai/select.ts';
import { loadCases } from '../grade.ts';

export async function generateFresh(flow, batch = 1) {
  const dir = join(flow, batch === 1 ? 'calibration-fresh' : `calibration-fresh-${batch}`);
  if (existsSync(join(dir, 'results.jsonl'))) throw new Error(`${dir} already exists; fresh outputs are generated once`);
  mkdirSync(join(dir, 'traces'), { recursive: true });
  const cases = loadCases(fileURLToPath(new URL(batch === 1 ? './cases.yaml' : `./cases-${batch}.yaml`, import.meta.url)));
  const rows = await Promise.all(cases.map(async c => {
    const call = await callSelectModel(c.settings, c.notes);
    if (!call.output) throw new Error(`${c.id}: no shortlist (${call.stopReason})`);
    writeFileSync(join(dir, 'traces', `${c.id}_rep0.json`), JSON.stringify([
      { role: 'system', content: call.system },
      { role: 'user', content: call.user },
      { role: 'assistant', content: JSON.stringify(call.output, null, 2) },
    ], null, 2));
    return { prompt_id: c.id, rep: 0, model: call.model, usage: call.usage, status: 'ok' };
  }));
  writeFileSync(join(dir, 'results.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  return dir;
}
