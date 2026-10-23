import { MILESTONES, type MilestoneKey } from '@/domain/milestones';
import type { ISODate } from '@/domain/dates';
import { aggregate, linkThread, processDoc, type MatchContext, type MatchSettings } from './match';
import type { EvidenceEvent, SourceDoc, SynthOutput } from './types';

/** Process one doc, record its events and link threads of committed emails. */
export function step(doc: SourceDoc, ctx: MatchContext, s: MatchSettings): EvidenceEvent[] {
  const evs = processDoc(doc, ctx, s);
  for (const e of evs) {
    ctx.events.push(e);
    if (e.decision === 'AUTO_COMMITTED' && e.pkgId && !e.flags.includes('AUTO_SPLIT')) linkThread(ctx, doc, e.pkgId);
  }
  return evs;
}

export function actualsByPackage(events: EvidenceEvent[]) {
  const byPkg: Record<string, EvidenceEvent[]> = {};
  for (const e of events) if (e.pkgId) (byPkg[e.pkgId] ??= []).push(e);
  return Object.fromEntries(Object.entries(byPkg).map(([k, v]) => [k, aggregate(v)]));
}

export interface EvalMetrics {
  at: string; docs: number; expectedDates: number; correctDates: number; wrongDates: number; missingDates: number;
  dateAccuracy: number; coverage: number; autoCommitted: number; autoCorrect: number; autoPrecision: number;
  queued: number; ignored: number; duplicates: number; errors: number;
  pkgPrecision: number; pkgRecall: number; msPrecision: number; msRecall: number;
  confusion: Record<string, Record<string, number>>;
  mismatches: { docId?: string; pkgId?: string; key?: string; expected: string; got: string; kind: 'date' | 'decision' }[];
}

export function evaluate(synth: SynthOutput, events: EvidenceEvent[]): EvalMetrics {
  const actuals = actualsByPackage(events);
  const mismatches: EvalMetrics['mismatches'] = [];
  let expectedDates = 0, correct = 0, wrong = 0, missing = 0;
  for (const [pkgId, exp] of Object.entries(synth.expected)) {
    for (const m of MILESTONES) {
      const want = exp[m.key as MilestoneKey] as ISODate | undefined;
      const got = actuals[pkgId]?.[m.key]?.date;
      if (!want) { if (got) { wrong++; mismatches.push({ pkgId, key: m.key, expected: '— (no event)', got, kind: 'date' }); } continue; }
      expectedDates++;
      if (got === want) correct++;
      else if (!got) { missing++; mismatches.push({ pkgId, key: m.key, expected: want, got: 'pending (queue)', kind: 'date' }); }
      else { wrong++; mismatches.push({ pkgId, key: m.key, expected: want, got, kind: 'date' }); }
    }
  }
  const confusion: EvalMetrics['confusion'] = {};
  let autoCommitted = 0, autoCorrect = 0, pkgTP = 0, pkgPred = 0, pkgTruth = 0, msTP = 0, msPred = 0, msTruth = 0;
  const byDoc = new Map<string, EvidenceEvent[]>();
  events.forEach((e) => byDoc.set(e.docId, [...(byDoc.get(e.docId) ?? []), e]));
  for (const [docId, t] of Object.entries(synth.truth)) {
    const evs = byDoc.get(docId) ?? [];
    const e = evs[0];
    const got = e?.decision ?? 'MISSING';
    const want = { commit: 'AUTO_COMMITTED', support: 'AUTO_COMMITTED', ignore: 'IGNORED', queue: 'QUEUED', duplicate: 'DUPLICATE', error: 'ERROR' }[t.effect];
    (confusion[want] ??= {})[got] = (confusion[want][got] ?? 0) + 1;
    if (t.pkgId) pkgTruth++;
    if (t.key) msTruth++;
    for (const ev of evs) {
      if (ev.decision !== 'AUTO_COMMITTED') continue;
      autoCommitted++;
      const both = t.note === 'covers both facades';
      const pkgOk = ev.pkgId === t.pkgId || both;
      const keyOk = !t.key ? !ev.key || String(ev.key).endsWith('approved') : ev.key === t.key;
      if (pkgOk && keyOk && (t.effect === 'commit' || t.effect === 'support')) autoCorrect++;
      else mismatches.push({ docId, expected: `${t.effect} ${t.key ?? ''}`, got: `committed ${ev.key} → ${ev.pkgId}`, kind: 'decision' });
      if (ev.pkgId) { pkgPred++; if (pkgOk) pkgTP++; }
      if (ev.key && !String(ev.key).endsWith('approved')) { msPred++; if (keyOk) msTP++; }
    }
    if (want !== got && !(want === 'AUTO_COMMITTED' && got === 'QUEUED'))
      mismatches.push({ docId, expected: want, got, kind: 'decision' });
  }
  const count = (d: string) => events.filter((e) => e.decision === d).length;
  return {
    at: new Date().toISOString(), docs: Object.keys(synth.truth).length, expectedDates, correctDates: correct, wrongDates: wrong, missingDates: missing,
    dateAccuracy: expectedDates ? correct / (correct + wrong + missing) : 0, coverage: expectedDates ? (correct + wrong) / expectedDates : 0,
    autoCommitted, autoCorrect, autoPrecision: autoCommitted ? autoCorrect / autoCommitted : 1,
    queued: count('QUEUED'), ignored: count('IGNORED'), duplicates: count('DUPLICATE'), errors: count('ERROR'),
    pkgPrecision: pkgPred ? pkgTP / pkgPred : 1, pkgRecall: pkgTruth ? pkgTP / pkgTruth : 1,
    msPrecision: msPred ? msTP / msPred : 1, msRecall: msTruth ? msTP / msTruth : 1, confusion, mismatches,
  };
}
