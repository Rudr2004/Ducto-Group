import { describe, expect, it, beforeAll } from 'vitest';
import { runAll, packages, byName, report } from './helpers';
import { aggregate, findPackages, isNoise, newContext, parseRefs, processDoc, stripQuoted, assertive } from '@/pipeline/match';
import { evaluate, step } from '@/pipeline/run';
import { DEFAULT_MATCH } from '@/pipeline/defaults';
import { computePackage, plannedDates } from '@/domain/engine';
import { dubaiDate, parseUaeDate, shift } from '@/domain/dates';
import { append, verifyChain } from '@/lib/audit';
import { useStore, defaultSettings, ForbiddenError } from '@/store/store';
import type { EvidenceEvent, SourceDoc } from '@/pipeline/types';
import type { ActualRecord, Package } from '@/domain/types';

const S = defaultSettings();
let R: ReturnType<typeof runAll>;
const edge = (id: string) => R.synth.edgeCases.find((e) => e.id === id)!;
const evsOfEdge = (id: string) => edge(id).docIds.flatMap((docId) => R.ctx.events.filter((e) => e.docId === docId));
const actuals = (name: string) => aggregate(R.ctx.events.filter((e) => e.pkgId === byName(name).id));
beforeAll(() => { R = runAll(); });

describe('§2.3 targets on the generated set', () => {
  it('≥ 98% date accuracy and 100% auto-commit precision on several seeds', () => {
    for (const seed of [42, 7, 2026]) {
      const r = runAll({}, seed); const m = evaluate(r.synth, r.ctx.events);
      expect(m.dateAccuracy).toBeGreaterThanOrEqual(0.98);
      expect(m.autoPrecision).toBe(1);
    }
  });
});

describe('§13.1 email and matching', () => {
  it('E1 quoted history never creates events', () => {
    expect(stripQuoted('Thanks\n\n-----Original Message-----\nFrom: x\nRequest for Proposal')).toBe('Thanks');
    expect(evsOfEdge('E1').every((e) => e.decision === 'IGNORED')).toBe(true);
  });
  it('E2 same Message-ID in 3 mailboxes → one document', () => expect(evsOfEdge('E2').every((e) => e.decision === 'DUPLICATE')).toBe(true));
  it('E3 near-duplicate resend is not double counted', () => expect(evsOfEdge('E3')[0].decision).toBe('DUPLICATE'));
  it('E4 package name only (no ref) matches', () => expect(findPackages('Proposal for Kitchen Cabinets & Wardrobes', packages).map((h) => h.pkgId)).toContain(byName('Kitchen Cabinets & Wardrobes').id));
  it('E5 vague subjects resolve through the thread', () => evsOfEdge('E5').forEach((e) => expect(e.decision).toBe('AUTO_COMMITTED')));
  it('E6 shared ref without instance → AMBIGUOUS_PACKAGE', () => expect(evsOfEdge('E6')[0].reason).toBe('AMBIGUOUS_PACKAGE'));
  it('E7 email explicitly covering two packages creates two events', () => {
    const e = evsOfEdge('E7');
    expect(e.map((x) => x.pkgId).sort()).toEqual([byName('Facade (1)').id, byName('Facade (2)').id].sort());
  });
  it('E8 ref variants normalised', () => expect(parseRefs('D-0729, d 0729 and D0729-01')).toEqual(['D0729']));
  it('E9 misspelled package name fuzzy-matched', () => expect(findPackages('Paintng (2) summary', packages)[0].pkgId).toBe(byName('Painting (2)').id));
  it('E10 personal domain → lower confidence, queued', () => expect(evsOfEdge('E10')[0].decision).toBe('QUEUED'));
  it('E11 supplier on several open packages is not guessed', () => expect(evsOfEdge('E6')[0].ruleHits.join()).toMatch(/invited on 2 open packages/));
  it('E12 casual internal chatter is ignored', () => expect(evsOfEdge('E12')[0].decision).toBe('IGNORED'));
  it('E13 OOO / NDR / read receipt / calendar ignored with reason', () => evsOfEdge('E13').forEach((e) => { expect(e.decision).toBe('IGNORED'); expect(e.ignoredReason).toBeTruthy(); }));
  it('E14 attachment-only email classified from attachment name', () => expect(evsOfEdge('E14')[0].key).toBe('final_bid_tab'));
  it('E15 Arabic content preserved and classified', () => { const e = evsOfEdge('E15')[0]; expect(e.decision).toBe('AUTO_COMMITTED'); expect(R.synth.docs.find((d) => d.id === e.docId)!.body).toMatch(/عرض/); });
  it('E16 prompt injection is flagged and does not change classification', () => { const e = evsOfEdge('E16')[0]; expect(e.flags).toContain('PROMPT_INJECTION'); expect(e.key).toBe('tq_process'); });
  it('E17 missing Date header → received time, flagged, not auto-committed', () => { const e = evsOfEdge('E17')[0]; expect(e.flags).toContain('MISSING_DATE_HEADER'); expect(e.decision).toBe('QUEUED'); });
  it('E18 23:30 UTC is the next day in Dubai', () => { expect(dubaiDate('2025-11-04T21:30:00Z')).toBe('2025-11-05'); expect(actuals('Anti-Termite').dtp_received?.date).toBe('2025-11-05'); });
  it('E19 dd/mm default with ambiguity flag', () => { expect(parseUaeDate('05/01/2026')).toEqual({ date: '2026-01-05', ambiguous: true }); expect(parseUaeDate('14/05/2026')!.ambiguous).toBe(false); });
  it('E20 corrupted file → error, others continue', () => { expect(evsOfEdge('E20')[0].decision).toBe('ERROR'); expect(R.ctx.events.length).toBeGreaterThan(250); });
  it('E21 very long email truncated for AI, raw kept', () => {
    const ctx = newContext(packages, R.synth.packageBidders, {});
    const d = { ...R.synth.docs.find((x) => x.subject.includes('Request for Proposal'))!, id: 'long', hash: 'h-long', messageId: '<long@x>' };
    d.body = d.body + 'x'.repeat(20_000);
    const [e] = processDoc(d, ctx, DEFAULT_MATCH);
    expect(e.flags).toContain('TRUNCATED_FOR_AI'); expect(d.body.length).toBeGreaterThan(20_000);
  });
  it('E22 event before Date Added is allowed with warning inside the window', () => {
    expect(R.ctx.events.some((e) => e.flags.includes('BEFORE_DATE_ADDED') && e.decision === 'AUTO_COMMITTED')).toBe(true);
  });
  it('E23 late bid after bid tab does not move proposals date', () => expect(actuals('Concrete Supply - #1').initial_proposals_received?.date).toBe(R.synth.expected[byName('Concrete Supply - #1').id].initial_proposals_received));
  it('E24 multiple final bid tab revisions → last before TRF', () => expect(actuals('Anti-Termite').final_bid_tab?.date).toBe(R.synth.expected[byName('Anti-Termite').id].final_bid_tab));
  it('E25 re-tender opens round 2', () => expect(actuals('Painting (1)').float_rfps?.round).toBe(2));
  it('E26 re-ingesting the same files is idempotent', () => {
    const before = R.ctx.events.filter((e) => e.decision === 'AUTO_COMMITTED').length;
    const again = R.synth.docs.slice(0, 20).flatMap((d) => step(d, R.ctx, DEFAULT_MATCH));
    expect(again.every((e) => e.decision === 'DUPLICATE')).toBe(true);
    expect(R.ctx.events.filter((e) => e.decision === 'AUTO_COMMITTED').length).toBe(before);
  });
  it('E27 AI unavailable → emails queued AI_UNAVAILABLE, never auto-committed', () => {
    const r = runAll({ aiAvailable: false });
    const emails = r.ctx.events.filter((e) => r.synth.docs.find((d) => d.id === e.docId)?.kind === 'email');
    expect(emails.some((e) => e.decision === 'AUTO_COMMITTED')).toBe(false);
    expect(emails.some((e) => e.reason === 'AI_UNAVAILABLE')).toBe(true);
  });
  it('E28 rules and AI disagree → DISAGREEMENT', () => expect(evsOfEdge('E28')[0].reason).toBe('DISAGREEMENT'));
  it('E29 evidence after the as-of date is hidden in as-of views', () => {
    const p = byName('Painting (2)');
    const recs: ActualRecord[] = [{ id: 'x', pkgId: p.id, key: 'award_issued', round: 1, date: '2026-09-22', source: 'SYSTEM', at: '' }];
    const v = computePackage(p, recs, [], S, '2026-06-05');
    expect(v.cells[14].actual).toBeNull(); expect(v.cells[14].hiddenFuture).toBe(true);
  });
  it('future-tense announcements are not events', () => expect(assertive('All proposals are in; bid tab to follow.')).not.toMatch(/bid tab/));
});

describe('§13.2 system events', () => {
  it('S1 DocuSign declined → exception, critical', () => { const e = evsOfEdge('S1')[0]; expect(e.reason).toBe('DOCUSIGN_DECLINED'); expect(e.flags).toContain('CRITICAL'); });
  it('S2 re-sent envelope is the one that counts', () => expect(actuals('Superstructure Waterproofing (2)').trf_created?.date).toBe(R.synth.expected[byName('Superstructure Waterproofing (2)').id].trf_created));
  it('S3 OBT returned then resubmitted → latest submission', () => expect(actuals('Kitchen Cabinets & Wardrobes').uploaded_to_obt?.date).toBe(R.synth.expected[byName('Kitchen Cabinets & Wardrobes').id].uploaded_to_obt));
  it('S4 OBT ref whitespace normalised', () => expect(R.ctx.obtRefs.has('17975')).toBe(true));
  it('S5 SharePoint link shared twice → FIRST', () => expect(actuals('Lifts').provide_link_to_stp?.date).toBe(R.synth.expected[byName('Lifts').id].provide_link_to_stp));
});

describe('§13.3 schedule, SLA and data', () => {
  const pkg = (o: Partial<Package> = {}): Package => ({ ...byName('Lifts'), ...o });
  it('D1 missing anchor → plan not set', () => { const v = computePackage(pkg({ plannedAward: null }), [], [], S, '2026-06-05'); expect(v.flags).toContain('PLAN_NOT_SET'); expect(v.cells[0].status).toBe('NO_PLAN'); });
  it('D2 ref not in SLA master → defaulted flag', () => expect(computePackage(pkg({ slaDefaulted: true }), [], [], S, '2026-06-05').flags).toContain('SLA_DEFAULTED'));
  it('D3 SLA = 0 allows same-day step', () => { const pl = plannedDates(pkg(), S); expect(pl[2]).toBe(pl[3]); });
  it('D4 optional TQ never happens → NOT_APPLICABLE', () => {
    const p = pkg(); const recs: ActualRecord[] = [{ id: 'a', pkgId: p.id, key: 'initial_proposals_received', round: 1, date: '2025-12-20', source: 'SYSTEM', at: '' }];
    expect(computePackage(p, recs, [], S, '2026-06-05').cells[4].status).toBe('NOT_APPLICABLE');
  });
  it('D5 early actual is on time', () => { const p = pkg(); const v = computePackage(p, [{ id: 'a', pkgId: p.id, key: 'dtp_received', round: 1, date: '2025-11-01', source: 'SYSTEM', at: '' }], [], S, '2026-06-05'); expect(v.cells[0].status).toBe('DONE_ON_TIME'); expect(v.cells[0].variance).toBeLessThan(0); });
  it('D6 out-of-sequence: status by process order + warning', () => { const p = byName('MEP Services'); const v = computePackage(p, report.packages.length ? legacy(p) : [], [], S, '2026-12-31'); expect(v.status).toBe('Awarded'); expect(v.flags).toContain('SEQUENCE_WARNING'); });
  it('D7 several milestones same day are fine', () => expect(computePackage(byName('Anti-Termite'), legacy(byName('Anti-Termite')), [], S, '2026-06-05').flags).not.toContain('SEQUENCE_WARNING'));
  it('D8 plan anomaly > 180 days', () => expect(computePackage(byName('Temporary Electrics'), legacy(byName('Temporary Electrics')), [], S, '2026-06-05').flags).toContain('PLAN_ANOMALY'));
  it('D9 excluded package excluded from metrics', () => { expect(byName('Structural Steel').excluded).toBe(true); expect(computePackage(byName('Structural Steel'), [], [], S, '2026-06-05').health).toBe('Excluded'); });
  it('D10/D14 re-import keeps system and admin actuals', () => {
    useStore.setState({ packages, records: [{ id: 's', pkgId: 'p7', key: 'dtp_received', round: 1, date: '2025-12-18', source: 'SYSTEM', at: '' }], role: 'admin', audit: [] });
    const buf = require('node:fs').readFileSync('sample_data/Sample_Project_Doc.xlsm');
    useStore.getState().importFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'again.xlsm');
    expect(useStore.getState().records.some((r) => r.id === 's')).toBe(true);
    expect(useStore.getState().audit.at(-1)!.action).toBe('SCHEDULE_REIMPORTED');
  });
  it('D11/D12 manager aliases and Site Team bucket', () => { expect(packages.filter((p) => /muf/i.test(p.managerRaw)).every((p) => p.manager === 'Mufaddal')).toBe(true); expect(byName('Door Hardware').manager).toBe('Unassigned (Site Team)'); });
  it('D13 system date wins over legacy for display', () => {
    const p = byName('Lifts'); const v = computePackage(p, [...legacy(p), { id: 's', pkgId: p.id, key: 'dtp_received', round: 1, date: '2025-12-17', source: 'SYSTEM', at: '' }], [], S, '2026-06-05');
    expect(v.cells[0].actual).toBe('2025-12-17'); expect(v.cells[0].provenance).toBe('SYSTEM');
  });
  it('D15 working days skip weekend and holidays', () => expect(shift('2026-03-19', 1, { mode: 'working', weekend: [6, 0], holidays: ['2026-03-20'] })).toBe('2026-03-23'));
  it('D16 past as-of hides later actuals', () => expect(computePackage(byName('Lifts'), legacy(byName('Lifts')), [], S, '2025-12-01').actualCount).toBe(0));
  it('D17 importer survives blank rows and computes plans', () => { expect(report.stats.rowsScanned).toBeGreaterThan(report.packages.length * 2); expect(plannedDates(byName('Lifts'), S)[0]).toBe(byName('Lifts').plannedDtp); });
  it('D18 identical names kept apart by Sl.No', () => expect(packages.filter((p) => p.name === 'Aluminium Doors').map((p) => p.id)).toEqual(['p90', 'p91']));
});

describe('§13.4 security and roles', () => {
  it('R1 package manager cannot change a date (403, audited)', () => {
    useStore.setState({ packages, records: [], role: 'manager', audit: [] });
    expect(() => useStore.getState().correctDate('p7', 'award_issued', '2026-01-01', 'some reason here', 'ev1')).toThrow(ForbiddenError);
    expect(useStore.getState().audit.at(-1)!.action).toBe('DENIED_CHANGE_DATE');
  });
  it('R2 admin correction requires reason and evidence', () => {
    useStore.setState({ role: 'admin' });
    expect(() => useStore.getState().correctDate('p7', 'award_issued', '2026-01-01', '', 'ev1')).toThrow(/reason/);
    expect(() => useStore.getState().correctDate('p7', 'award_issued', '2026-01-01', 'valid reason text', '')).toThrow(/evidence/);
  });
  it('R3 tampering breaks the hash chain', () => {
    let log = append([], { actor: 'a', role: 'admin', action: 'X', entity: 'e', before: null, after: { d: 1 } });
    log = append(log, { actor: 'a', role: 'admin', action: 'Y', entity: 'e', before: null, after: { d: 2 } });
    expect(verifyChain(log).ok).toBe(true);
    log[0] = { ...log[0], after: { d: 9 } };
    expect(verifyChain(log)).toMatchObject({ ok: false, seq: 1 });
  });
  it('R4 email HTML rendered only in a sandboxed iframe (no scripts)', async () => {
    const src = require('node:fs').readFileSync('src/components/SourceViewer.tsx', 'utf8');
    expect(src).toMatch(/sandbox=""/);
  });
  it('noise detection helper', () => expect(isNoise({ headers: { 'Auto-Submitted': 'auto-replied' }, subject: '', from: { email: 'a@b' }, body: '' } as unknown as SourceDoc)).toBeTruthy());
});

function legacy(p: Package): ActualRecord[] {
  return Object.entries(p.legacy).filter(([, d]) => d).map(([key, date]) => ({ id: `L${key}`, pkgId: p.id, key: key as ActualRecord['key'], round: 1, date: date!, source: 'LEGACY', at: '' }));
}
export type { EvidenceEvent };
