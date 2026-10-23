import fs from 'node:fs';
import { importWorkbook } from '@/lib/excelImport';
import { generateSynthetic } from '@/pipeline/synth';
import { newContext, resetEventSeq } from '@/pipeline/match';
import { step } from '@/pipeline/run';
import { DEFAULT_MATCH } from '@/pipeline/defaults';
import type { MatchSettings } from '@/pipeline/match';

const buf = fs.readFileSync('sample_data/Sample_Project_Doc.xlsm');
export const report = importWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
export const packages = report.packages;
export const byName = (n: string) => packages.find((p) => p.name === n)!;
export function runAll(overrides: Partial<MatchSettings> = {}, seed = 42) {
  resetEventSeq();
  const synth = generateSynthetic(packages, seed);
  const domains = Object.fromEntries(synth.suppliers.flatMap((s) => s.domains.map((d) => [d, s.name])));
  const ctx = newContext(packages, synth.packageBidders, domains);
  const s = { ...DEFAULT_MATCH, ...overrides };
  for (const d of synth.docs) step(d, ctx, s);
  return { synth, ctx, s };
}
