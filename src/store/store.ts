import { create } from 'zustand';
import { MILESTONES, type MilestoneKey, type Owner } from '@/domain/milestones';
import type { ActualRecord, Package, Rebaseline } from '@/domain/types';
import type { EngineSettings } from '@/domain/engine';
import { importWorkbook, type ImportReport } from '@/lib/excelImport';
import { append, verifyChain, type AuditEntry, type Role } from '@/lib/audit';
import { DEMO_PACKAGES, generateSynthetic } from '@/pipeline/synth';
import { aggregate, getEventSeq, newContext, resetEventSeq, setEventSeq, type MatchContext, type MatchSettings } from '@/pipeline/match';
import { evaluate, step, type EvalMetrics } from '@/pipeline/run';
import { DEFAULT_MATCH } from '@/pipeline/defaults';
import type { EvidenceEvent, SourceDoc, SynthOutput } from '@/pipeline/types';
import { isISODate, type ISODate } from '@/domain/dates';
import xlsmUrl from '../../sample_data/Sample_Project_Doc.xlsm?url';

export interface AppSettings extends EngineSettings {
  match: MatchSettings; aiOutage: boolean; digestHour: number; redactPii: boolean;
}
export const REPORTING_WEEK = '2026-06-05';
export const TODAY = new Date().toISOString().slice(0, 10);

export const defaultSettings = (): AppSettings => ({
  plannedMode: 'BACKWARD_FROM_AWARD',
  dayCounting: { mode: 'calendar', weekend: [6, 0], holidays: ['2026-03-20', '2026-03-21', '2026-05-27', '2026-05-28', '2026-12-02'] },
  dueSoonDays: 2, escalationDays: 5, slipAlertDays: 7, planAnomalyDays: 180,
  ownerMap: Object.fromEntries(MILESTONES.map((m) => [m.key, m.owner])) as Record<MilestoneKey, Owner>,
  match: { ...DEFAULT_MATCH }, aiOutage: false, digestHour: 8, redactPii: true,
});

export interface DelayNote { id: string; pkgId: string; author: string; text: string; at: string }
export interface Toast { id: number; tone: 'ok' | 'warn' | 'error' | 'info'; title: string; body?: string }
export interface IngestRun { running: boolean; done: number; total: number; startedAt?: number; finishedAt?: number; stage: number; current?: string }
export interface EvalRun { id: string; metrics: EvalMetrics; seed: number }

export const PEOPLE: Record<Role, { name: string; title: string }> = {
  admin: { name: 'Jassim', title: 'Strategic Excellence Manager · Admin' },
  manager: { name: 'Mani', title: 'Package Manager' },
  leadership: { name: 'Procurement Director', title: 'Leadership · read-only' },
};

export class ForbiddenError extends Error { status = 403; }

interface State {
  booted: boolean; bootError: string | null; report: ImportReport | null;
  packages: Package[]; records: ActualRecord[]; rebaselines: Rebaseline[]; notes: DelayNote[];
  settings: AppSettings; asOf: ISODate; role: Role;
  synth: SynthOutput | null; docs: SourceDoc[]; events: EvidenceEvent[]; ctx: MatchContext | null;
  ingest: IngestRun; audit: AuditEntry[]; evalRuns: EvalRun[]; toasts: Toast[];
  snoozed: string[]; alertAcks: string[]; digestsSent: { at: string; count: number }[]; selectedPkg: string | null;
  // actions
  boot: () => Promise<void>;
  importFile: (buf: ArrayBuffer, name: string) => void;
  generate: (seed?: number) => void;
  addUploads: (docs: SourceDoc[]) => void;
  processAll: (speedMs?: number) => Promise<void>;
  confirmException: (eventId: string, choice?: { pkgId: string; key: MilestoneKey }) => void;
  dismissException: (eventId: string, why: string) => void;
  splitException: (eventId: string, pkgIds: string[], key: MilestoneKey) => void;
  snooze: (eventId: string) => void;
  correctDate: (pkgId: string, key: MilestoneKey, date: string, reason: string, evidenceId: string) => void;
  rebaseline: (pkgId: string, key: MilestoneKey, date: string, reason: string) => void;
  toggleExclude: (pkgId: string, reason: string) => void;
  addNote: (pkgId: string, text: string) => void;
  tamper: () => void;
  runEval: (seed?: number) => void;
  setSettings: (p: Partial<AppSettings>) => void;
  setAsOf: (d: ISODate) => void; setRole: (r: Role) => void;
  openPkg: (id: string | null) => void;
  toast: (t: Omit<Toast, 'id'>) => void; dropToast: (id: number) => void;
  ackAlert: (key: string) => void; sendDigest: (count: number) => void;
  reset: () => Promise<void>;
}

let toastSeq = 0;
const nowIso = () => new Date().toISOString();
const sysActor = { actor: 'Control Tower (system)', role: 'system' as const };

function legacyRecords(pkgs: Package[]): ActualRecord[] {
  const out: ActualRecord[] = [];
  for (const p of pkgs) for (const m of MILESTONES) {
    const d = p.legacy[m.key];
    if (d) out.push({ id: `L-${p.id}-${m.key}`, pkgId: p.id, key: m.key, round: 1, date: d, source: 'LEGACY', at: '2026-06-05T00:00:00.000Z' });
  }
  return out;
}

export const useStore = create<State>((set, get) => {
  const guard = (action: string, entity: string, allowed: Role[] = ['admin']) => {
    const { role } = get();
    if (!allowed.includes(role)) {
      set((s) => ({ audit: append(s.audit, { actor: PEOPLE[role].name, role, action: `DENIED_${action}`, entity, before: null, after: { status: 403 }, reason: `Role "${role}" may not ${action.toLowerCase().replace(/_/g, ' ')}` }) }));
      throw new ForbiddenError(`403 — ${PEOPLE[role].title} cannot ${action.toLowerCase().replace(/_/g, ' ')}. Only the administrator can change dates.`);
    }
    return { actor: PEOPLE[role].name, role };
  };

  /** Re-derive SYSTEM actuals for one package from committed evidence; every change is audited with its evidence. */
  const syncPackage = (pkgId: string) => {
    const s = get();
    const agg = aggregate(s.events.filter((e) => e.pkgId === pkgId));
    let records = s.records, audit = s.audit;
    for (const m of MILESTONES) {
      const cur = records.find((r) => r.pkgId === pkgId && r.key === m.key && r.source === 'SYSTEM' && !r.supersededBy);
      const next = agg[m.key];
      if (next && cur && cur.date === next.date && cur.round === next.round) continue;
      if (!next && !cur) continue;
      const ev = next ? s.events.find((e) => e.id === next.eventId) : undefined;
      const rec: ActualRecord | null = next ? { id: `S-${pkgId}-${m.key}-${records.length}`, pkgId, key: m.key, round: next.round, date: next.date, source: 'SYSTEM', evidenceId: next.eventId, confidence: ev?.confidence, at: nowIso() } : null;
      records = records.map((r) => (r === cur ? { ...r, supersededBy: rec?.id ?? 'withdrawn' } : r));
      if (rec) records = [...records, rec];
      audit = append(audit, { ...sysActor, action: cur ? (rec ? 'ACTUAL_MOVED' : 'ACTUAL_WITHDRAWN') : 'ACTUAL_CAPTURED', entity: `${pkgId}:${m.key}`, before: cur ? { date: cur.date, round: cur.round } : null, after: rec ? { date: rec.date, round: rec.round, confidence: rec.confidence } : null, evidence: next?.eventId, reason: cur ? (rec ? `${m.rule === 'LAST' ? 'LAST' : 'FIRST'} rule re-evaluated with new evidence` : 'Evidence invalidated (declined / returned)') : undefined });
    }
    set({ records, audit });
  };

  const bootFrom = (report: ImportReport, source: string) => {
    const packages = report.packages.map((p) => ({ ...p, isDemo: DEMO_PACKAGES.includes(p.name) }));
    let audit: AuditEntry[] = [];
    audit = append(audit, { ...sysActor, action: 'SCHEDULE_IMPORTED', entity: source, before: null, after: report.stats, reason: 'Initial import of Dutco project tracker' });
    set({ report, packages, records: legacyRecords(packages), audit, booted: true, bootError: null, rebaselines: [], notes: [], events: [], docs: [], synth: null, ctx: null, evalRuns: [], snoozed: [], ingest: { running: false, done: 0, total: 0, stage: 0 } });
  };

  return {
    booted: false, bootError: null, report: null, packages: [], records: [], rebaselines: [], notes: [],
    settings: defaultSettings(), asOf: REPORTING_WEEK, role: 'admin',
    synth: null, docs: [], events: [], ctx: null, ingest: { running: false, done: 0, total: 0, stage: 0 }, audit: [], evalRuns: [], toasts: [],
    snoozed: [], alertAcks: [], digestsSent: [], selectedPkg: null,

    boot: async () => {
      try {
        // single-file build inlines the workbook as a data URL: decode it locally (no network); dev server serves it as a file
        const buf = xlsmUrl.startsWith('data:')
          ? Uint8Array.from(atob(xlsmUrl.slice(xlsmUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer
          : await (await fetch(xlsmUrl)).arrayBuffer();
        bootFrom(importWorkbook(buf), 'Sample_Project_Doc.xlsm');
        get().generate(42);
      } catch (e) { set({ bootError: (e as Error).message, booted: true }); }
    },

    importFile: (buf, name) => {
      guard('IMPORT_SCHEDULE', name);
      try {
        const rep = importWorkbook(buf);
        const prev = get().packages;
        const added = rep.packages.filter((p) => !prev.some((x) => x.id === p.id)).length;
        const removed = prev.filter((p) => !rep.packages.some((x) => x.id === p.id)).length;
        // D14: re-import never overwrites system-captured or admin-corrected actuals; only legacy + plan data update
        const keep = get().records.filter((r) => r.source !== 'LEGACY');
        const packages = rep.packages.map((p) => ({ ...p, isDemo: DEMO_PACKAGES.includes(p.name), excluded: prev.find((x) => x.id === p.id)?.excluded ?? p.excluded }));
        set((s) => ({ report: rep, packages, records: [...legacyRecords(packages), ...keep], audit: append(s.audit, { actor: PEOPLE[s.role].name, role: s.role, action: 'SCHEDULE_REIMPORTED', entity: name, before: { packages: prev.length }, after: { ...rep.stats, added, removed } }) }));
        get().toast({ tone: 'ok', title: `Imported ${rep.packages.length} packages`, body: `${added} added, ${removed} removed · system-captured dates kept` });
      } catch (e) { get().toast({ tone: 'error', title: 'Import failed', body: (e as Error).message }); }
    },

    generate: (seed = 42) => {
      resetEventSeq();
      const synth = generateSynthetic(get().packages, seed);
      const domains = Object.fromEntries(synth.suppliers.flatMap((s) => s.domains.map((d) => [d, s.name])));
      set((x) => ({ records: x.records.filter((r) => r.source !== 'SYSTEM'), synth, ctx: newContext(get().packages, synth.packageBidders, domains), docs: [], events: [], ingest: { running: false, done: 0, total: synth.docs.length, stage: 0 } }));
    },

    addUploads: (docs) => {
      guard('RUN_INGESTION', 'upload');
      if (!get().synth) get().generate();
      const synth = get().synth!;
      set({ synth: { ...synth, docs: [...synth.docs, ...docs] } });
    },

    processAll: async (speedMs = 18) => {
      const st = get();
      if (st.ingest.running) return;
      guard('RUN_INGESTION', 'mailbox');
      if (!st.synth || !st.ctx) get().generate();
      const { synth, ctx } = get();
      const s = { ...get().settings.match, aiAvailable: !get().settings.aiOutage, redactPii: get().settings.redactPii };
      const queue = synth!.docs.filter((d) => !get().docs.some((x) => x.id === d.id));
      const already = synth!.docs.length - queue.length;
      if (!queue.length) {
        // E26: re-ingesting the same folder is idempotent — every file is recognised by its hash
        const evs = synth!.docs.slice(0, 5).map((d) => step(d, ctx!, s)).flat();
        set((x) => ({ events: [...x.events, ...evs] }));
        get().toast({ tone: 'info', title: 'Nothing new to ingest', body: `All ${synth!.docs.length} files were already processed (matched by SHA-256). No duplicates created.` });
        return;
      }
      set({ ingest: { running: true, done: already, total: synth!.docs.length, startedAt: Date.now(), stage: 0 } });
      const touched = new Set<string>();
      for (let i = 0; i < queue.length; i++) {
        const d = queue[i];
        const evs = step(d, ctx!, s);
        evs.forEach((e) => e.pkgId && touched.add(e.pkgId));
        set((x) => ({ docs: [...x.docs, d], events: [...ctx!.events], ingest: { ...x.ingest, done: already + i + 1, current: d.subject || d.fileName, stage: (i % 8) } }));
        for (const e of evs) if (e.pkgId && (e.decision === 'AUTO_COMMITTED' || e.invalidated !== undefined || e.reason === 'DOCUSIGN_DECLINED' || e.reason === 'OBT_RETURNED')) syncPackage(e.pkgId);
        if (speedMs) await new Promise((r) => setTimeout(r, speedMs));
      }
      touched.forEach(syncPackage);
      const evs = get().events;
      set((x) => ({ ingest: { ...x.ingest, running: false, finishedAt: Date.now(), current: undefined }, audit: append(x.audit, { ...sysActor, action: 'INGESTION_RUN', entity: 'generated mailbox', before: null, after: { files: queue.length, committed: evs.filter((e) => e.decision === 'AUTO_COMMITTED').length, queued: evs.filter((e) => e.decision === 'QUEUED').length, ignored: evs.filter((e) => e.decision === 'IGNORED').length, duplicates: evs.filter((e) => e.decision === 'DUPLICATE').length, errors: evs.filter((e) => e.decision === 'ERROR').length } }) }));
      get().toast({ tone: 'ok', title: 'Mailbox processed', body: `${evs.filter((e) => e.decision === 'AUTO_COMMITTED').length} events captured automatically · ${evs.filter((e) => e.decision === 'QUEUED').length} sent to the exception queue` });
    },

    confirmException: (eventId, choice) => {
      const who = guard('RESOLVE_EXCEPTION', eventId);
      const ev = get().events.find((e) => e.id === eventId);
      if (!ev || ev.decision !== 'QUEUED') return;
      const pkgId = choice?.pkgId ?? ev.pkgId, key = choice?.key ?? (ev.key as MilestoneKey | null);
      if (!pkgId || !key) { get().toast({ tone: 'warn', title: 'Pick a package and milestone first' }); return; }
      if (ev.reason === 'DOCUSIGN_DECLINED' || ev.reason === 'OBT_RETURNED') { get().dismissException(eventId, 'Acknowledged — no milestone set'); return; }
      const ctx = get().ctx!;
      const doc = get().docs.find((d) => d.id === ev.docId);
      const resolved = (e: EvidenceEvent, how: string): EvidenceEvent => ({ ...e, pkgId: pkgId!, key: key!, decision: 'AUTO_COMMITTED', resolvedBy: who.actor, resolution: how, round: ctx.rounds[pkgId!] ?? 1, confidence: 1 });
      let applied = 0;
      let events = get().events.map((e) => (e.id === eventId ? resolved(e, choice ? 'Admin chose another candidate' : 'Admin confirmed suggestion') : e));
      // learning: supplier → package for this round; apply to similar queued items
      if (ev.supplier && ev.reason === 'AMBIGUOUS_PACKAGE') {
        ctx.learned[ev.supplier] = pkgId;
        events = events.map((e) => {
          if (e.id !== eventId && e.decision === 'QUEUED' && e.reason === 'AMBIGUOUS_PACKAGE' && e.supplier === ev.supplier && e.key === key) { applied++; return resolved(e, `Learned rule applied (${ev.supplier} → package)`); }
          return e;
        });
      }
      ctx.events = events;
      if (doc) ctx.threads.set(doc.messageId ?? doc.id, pkgId);
      set((s) => ({ events, audit: append(s.audit, { actor: who.actor, role: who.role, action: 'EXCEPTION_RESOLVED', entity: eventId, before: { reason: ev.reason, suggested: ev.pkgId, key: ev.key }, after: { pkgId, key, appliedToSimilar: applied }, evidence: ev.docId }) }));
      syncPackage(pkgId);
      get().toast({ tone: 'ok', title: 'Confirmed', body: applied ? `Applied to ${applied} similar item${applied > 1 ? 's' : ''}` : 'Milestone evidence committed and audited' });
    },

    dismissException: (eventId, why) => {
      const who = guard('RESOLVE_EXCEPTION', eventId);
      const events = get().events.map((e) => (e.id === eventId ? { ...e, decision: 'IGNORED' as const, ignoredReason: why, resolvedBy: who.actor, resolution: why } : e));
      get().ctx!.events = events;
      set((s) => ({ events, audit: append(s.audit, { actor: who.actor, role: who.role, action: 'EXCEPTION_DISMISSED', entity: eventId, before: null, after: { decision: 'IGNORED' }, reason: why }) }));
      get().toast({ tone: 'info', title: 'Marked as not a milestone', body: why });
    },

    splitException: (eventId, pkgIds, key) => {
      const who = guard('RESOLVE_EXCEPTION', eventId);
      const ev = get().events.find((e) => e.id === eventId)!;
      const clones = pkgIds.map((pkgId, i) => ({ ...ev, id: `${ev.id}-${i + 1}`, pkgId, key, decision: 'AUTO_COMMITTED' as const, resolvedBy: who.actor, resolution: 'Split by admin', confidence: 1 }));
      const events = [...get().events.filter((e) => e.id !== eventId), ...clones];
      get().ctx!.events = events;
      set((s) => ({ events, audit: append(s.audit, { actor: who.actor, role: who.role, action: 'EXCEPTION_SPLIT', entity: eventId, before: null, after: { pkgIds, key } }) }));
      pkgIds.forEach(syncPackage);
    },

    snooze: (eventId) => set((s) => ({ snoozed: [...s.snoozed, eventId] })),

    correctDate: (pkgId, key, date, reason, evidenceId) => {
      const who = guard('CHANGE_DATE', `${pkgId}:${key}`);
      // R2: correction requires reason + evidence
      if (!reason.trim() || reason.trim().length < 8) throw new Error('A reason of at least 8 characters is required.');
      if (!evidenceId) throw new Error('Link the evidence that supports this date.');
      if (!isISODate(date)) throw new Error('Choose a valid date.');
      const s = get();
      const cur = s.records.filter((r) => r.pkgId === pkgId && r.key === key && !r.supersededBy && r.source !== 'LEGACY').at(-1);
      const rec: ActualRecord = { id: `A-${pkgId}-${key}-${s.records.length}`, pkgId, key, round: cur?.round ?? 1, date, source: 'ADMIN', evidenceId, reason, at: nowIso() };
      set({ records: [...s.records.map((r) => (r === cur ? { ...r, supersededBy: rec.id } : r)), rec], audit: append(s.audit, { actor: who.actor, role: who.role, action: 'ACTUAL_CORRECTED', entity: `${pkgId}:${key}`, before: cur ? { date: cur.date, source: cur.source } : null, after: { date }, reason, evidence: evidenceId }) });
      get().toast({ tone: 'ok', title: 'Date corrected', body: 'Original value kept and visible · audit row written' });
    },

    rebaseline: (pkgId, key, date, reason) => {
      const who = guard('REBASELINE', `${pkgId}:${key}`);
      if (!reason.trim()) throw new Error('A reason is required to re-baseline.');
      set((s) => ({ rebaselines: [...s.rebaselines, { pkgId, key, date, reason, at: nowIso() }], audit: append(s.audit, { actor: who.actor, role: who.role, action: 'PLAN_REBASELINED', entity: `${pkgId}:${key}`, before: null, after: { date }, reason }) }));
      get().toast({ tone: 'ok', title: 'Plan re-baselined', body: 'Original baseline kept for comparison' });
    },

    toggleExclude: (pkgId, reason) => {
      const who = guard('EXCLUDE_PACKAGE', pkgId);
      const p = get().packages.find((x) => x.id === pkgId)!;
      set((s) => ({ packages: s.packages.map((x) => (x.id === pkgId ? { ...x, excluded: !x.excluded } : x)), audit: append(s.audit, { actor: who.actor, role: who.role, action: p.excluded ? 'PACKAGE_INCLUDED' : 'PACKAGE_EXCLUDED', entity: pkgId, before: { excluded: p.excluded }, after: { excluded: !p.excluded }, reason }) }));
    },

    addNote: (pkgId, text) => {
      const who = guard('ADD_DELAY_NOTE', pkgId, ['admin', 'manager']);
      if (!text.trim()) return;
      set((s) => ({ notes: [...s.notes, { id: `n${s.notes.length + 1}`, pkgId, author: who.actor, text: text.trim(), at: nowIso() }], audit: append(s.audit, { actor: who.actor, role: who.role, action: 'DELAY_NOTE_ADDED', entity: pkgId, before: null, after: { text: text.trim() } }) }));
    },

    tamper: () => {
      // Demo of R3: simulate someone editing a row directly in the database
      set((s) => {
        if (s.audit.length < 3) return s;
        const i = Math.min(s.audit.length - 2, Math.max(1, Math.floor(s.audit.length / 2)));
        const audit = s.audit.map((r, k) => (k === i ? { ...r, after: { ...(r.after as object), date: '2026-01-01', tampered: true } } : r));
        return { audit };
      });
      get().toast({ tone: 'warn', title: 'Row edited directly in the database', body: 'Run "Verify chain" to see the tamper detected.' });
    },

    runEval: (seed = 42) => {
      guard('RUN_EVALUATION', 'eval');
      const saved = getEventSeq();
      resetEventSeq();
      const synth = generateSynthetic(get().packages, seed);
      const domains = Object.fromEntries(synth.suppliers.flatMap((s) => s.domains.map((d) => [d, s.name])));
      const ctx = newContext(get().packages, synth.packageBidders, domains);
      const s = { ...get().settings.match, aiAvailable: !get().settings.aiOutage };
      for (const d of synth.docs) step(d, ctx, s);
      const metrics = evaluate(synth, ctx.events);
      setEventSeq(saved); // evaluation runs on its own clean context; live event ids continue
      set((x) => ({ evalRuns: [{ id: `run${x.evalRuns.length + 1}`, metrics, seed }, ...x.evalRuns], audit: append(x.audit, { actor: PEOPLE[x.role].name, role: x.role, action: 'EVALUATION_RUN', entity: `seed ${seed}`, before: null, after: { dateAccuracy: metrics.dateAccuracy, autoPrecision: metrics.autoPrecision } }) }));
    },

    setSettings: (p) => {
      const who = guard('CHANGE_SETTINGS', 'settings');
      set((s) => ({ settings: { ...s.settings, ...p }, audit: append(s.audit, { actor: who.actor, role: who.role, action: 'SETTING_CHANGED', entity: Object.keys(p).join(','), before: Object.fromEntries(Object.keys(p).map((k) => [k, (s.settings as unknown as Record<string, unknown>)[k]])), after: p }) }));
    },
    setAsOf: (asOf) => set({ asOf }),
    setRole: (role) => set({ role }),
    openPkg: (selectedPkg) => set({ selectedPkg }),
    toast: (t) => { const id = ++toastSeq; set((s) => ({ toasts: [...s.toasts, { ...t, id }] })); setTimeout(() => get().dropToast(id), 4200); },
    dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    ackAlert: (key) => set((s) => ({ alertAcks: [...s.alertAcks, key] })),
    sendDigest: (count) => set((s) => ({ digestsSent: [...s.digestsSent, { at: nowIso(), count }] })),
    reset: async () => { set({ booted: false }); await get().boot(); get().toast({ tone: 'info', title: 'Demo reset', body: 'Fresh import of the Dutco workbook; mailbox ready to process.' }); },
  };
});

export const verify = (log: AuditEntry[]) => verifyChain(log);
