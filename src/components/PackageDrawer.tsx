import { useMemo, useState } from 'react';
import { X, Lock, PencilLine, CalendarClock, EyeOff, Eye, ChevronDown, Bot, ListChecks, MessageSquarePlus, Users, History, Flag } from 'lucide-react';
import { useStore, PEOPLE } from '@/store/store';
import { useViews } from '@/lib/hooks';
import { MILESTONES, STAGES, type MilestoneKey } from '@/domain/milestones';
import { dubaiDate, fmt } from '@/domain/dates';
import { Dialog, Drawer, HealthChip, PkgStatus, Provenance, STATUS, confTone, Meter, cx } from './ui';
import { KIND_ICON, SourceViewer } from './SourceViewer';
import type { EvidenceEvent } from '@/pipeline/types';

const FLAG_TEXT: Record<string, string> = {
  SEQUENCE_WARNING: 'Out-of-sequence actual dates', PLAN_ANOMALY: 'Plan anomaly (> 180 days from actuals)', SLA_DEFAULTED: 'SLA defaulted (ref not in master)',
  AWARDED_INCOMPLETE: 'Awarded with fewer than 6 of 15 dates', PLAN_NOT_SET: 'Plan not set',
};

export function PackageDrawer() {
  const id = useStore((s) => s.selectedPkg);
  const openPkg = useStore((s) => s.openPkg);
  return <Drawer open={!!id} onClose={() => openPkg(null)} width={820} label="Package detail">{id && <Body id={id} onClose={() => openPkg(null)} />}</Drawer>;
}

function Body({ id, onClose }: { id: string; onClose: () => void }) {
  const views = useViews();
  const v = views.find((x) => x.pkg.id === id);
  const { events, docs, records, notes, audit, role, synth, asOf, rebaselines } = useStore();
  const [dlg, setDlg] = useState<null | 'correct' | 'rebase' | 'exclude'>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [viewer, setViewer] = useState<EvidenceEvent | null>(null);
  const [round, setRound] = useState<number | 'latest'>('latest');
  const pkgEvents = useMemo(() => events.filter((e) => e.pkgId === id), [events, id]);
  if (!v) return null;
  const rounds = [...new Set(pkgEvents.map((e) => e.round))].sort();
  const bidders = v.pkg.bidders.length ? v.pkg.bidders.map((b) => ({ vendor: b.vendor, awarded: b.awarded, synthetic: false })) : (synth?.packageBidders[id] ?? []).map((vendor) => ({ vendor, awarded: false, synthetic: true }));
  const isAdmin = role === 'admin';
  const pkgAudit = audit.filter((a) => a.entity.startsWith(`${id}:`) || a.entity === id).slice(-12).reverse();

  return (
    <div>
      <header className="sticky top-0 z-10 px-6 pt-5 pb-4" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] num" style={{ color: 'var(--muted)' }}>Sl {v.pkg.slNo} · {v.pkg.ref} · {v.pkg.category} · {v.pkg.manager}{v.pkg.managerRaw && v.pkg.manager !== v.pkg.managerRaw ? ` (sheet: “${v.pkg.managerRaw}”)` : ''}</div>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em] mt-0.5">{v.pkg.name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2"><PkgStatus s={v.status} /><HealthChip h={v.health} />{v.pkg.excluded && <span className="text-[12px] rounded-full px-2 py-0.5" style={{ background: 'var(--sunken)', color: 'var(--muted)' }}>Excluded from SLA metrics</span>}{v.pkg.isDemo && <span className="text-[12px] rounded-full px-2 py-0.5" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>POC package</span>}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close package"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <Stat label="Target award" value={fmt(v.cells[14].planned)} />
          <Stat label={v.status === 'Awarded' ? 'Awarded' : 'Forecast award'} value={fmt(v.forecastAward)} tone={(v.slippage ?? 0) > 0 && v.status !== 'Awarded' ? 'var(--late)' : undefined} sub={v.slippage !== null ? `${v.slippage > 0 ? '+' : ''}${v.slippage} days vs target` : 'plan not set'} />
          <Stat label="Captured by system" value={`${Math.round(v.systemShare * 100)}%`} sub={`${v.actualCount} actual dates as of ${fmt(asOf, true)}`} tone="var(--teal)" />
        </div>
        <MiniRail cells={v.cells} />
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button className="btn btn-sm" onClick={() => setDlg('correct')}>{isAdmin ? <PencilLine size={14} /> : <Lock size={14} />}Correct a date</button>
          <button className="btn btn-sm" onClick={() => setDlg('rebase')}>{isAdmin ? <CalendarClock size={14} /> : <Lock size={14} />}Re-baseline plan</button>
          <button className="btn btn-sm" onClick={() => setDlg('exclude')}>{isAdmin ? (v.pkg.excluded ? <Eye size={14} /> : <EyeOff size={14} />) : <Lock size={14} />}{v.pkg.excluded ? 'Include in metrics' : 'Exclude package'}</button>
          {rounds.length > 1 && (
            <select className="input ml-auto" value={String(round)} onChange={(e) => setRound(e.target.value === 'latest' ? 'latest' : +e.target.value)} aria-label="Tender round">
              <option value="latest">Latest round ({rounds.at(-1)})</option>{rounds.map((r) => <option key={r} value={r}>Round {r} history</option>)}
            </select>
          )}
        </div>
      </header>

      <div className="px-6 py-5 flex flex-col gap-5">
        {v.flags.filter((f) => FLAG_TEXT[f]).length > 0 && (
          <div className="flex flex-wrap gap-2">{v.flags.filter((f) => FLAG_TEXT[f]).map((f) => <span key={f} className="inline-flex items-center gap-1.5 text-[12px] rounded-md px-2 py-1" style={{ background: 'var(--soon-bg)', color: 'var(--soon)' }}><Flag size={12} />{FLAG_TEXT[f]}</span>)}</div>
        )}

        <section aria-label="Milestone timeline">
          <h3 className="font-semibold text-[14px] mb-3 flex items-center gap-2"><ListChecks size={16} />Milestone timeline</h3>
          <ol className="relative">
            {v.cells.map((c, i) => {
              const m = MILESTONES[i];
              const s = STATUS[c.status];
              const evs = pkgEvents.filter((e) => e.key === c.key && e.decision === 'AUTO_COMMITTED' && (round === 'latest' ? true : e.round === round));
              const history = records.filter((r) => r.pkgId === id && r.key === c.key && (r.supersededBy || r !== c.record) && r.id !== c.record?.id);
              const rb = rebaselines.filter((r) => r.pkgId === id && r.key === c.key);
              const isOpen = open === c.key;
              const newStage = i === 0 || MILESTONES[i - 1].stage !== m.stage;
              return (
                <li key={c.key}>
                  {newStage && <div className="text-[11.5px] font-semibold mb-1.5 mt-1 ml-9" style={{ color: 'var(--muted)' }}>Stage {m.stage} · {STAGES[m.stage]}</div>}
                  <div className="relative pl-9 pb-3">
                    {i < 14 && <span className="absolute left-[11px] top-6 bottom-0 w-[2px]" style={{ background: c.actual ? s.fg : 'var(--rail)', opacity: c.actual ? 0.35 : 1 }} aria-hidden />}
                    <span className="absolute left-0 top-0.5 h-6 w-6 rounded-full grid place-items-center" style={{ background: c.actual ? s.fg : 'var(--surface)', border: c.actual ? 'none' : `2px ${c.status === 'NOT_APPLICABLE' ? 'dashed' : 'solid'} ${c.status === 'UPCOMING' || c.status === 'NO_PLAN' || c.status === 'NOT_APPLICABLE' ? 'var(--line-strong)' : s.fg}`, color: '#fff' }}>
                      {c.actual ? <s.Icon size={13} strokeWidth={3} /> : <span className="text-[9px] font-bold num" style={{ color: 'var(--faint)' }}>{m.code}</span>}
                    </span>
                    <button className="w-full text-left rounded-lg -mt-0.5 px-2 py-1 hover:bg-[var(--sunken)]" onClick={() => setOpen(isOpen ? null : c.key)} aria-expanded={isOpen}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium text-[13.5px]">{m.name}</span>
                        <span className="text-[12px]" style={{ color: s.fg }}>{s.label}{c.variance ? ` · ${c.variance > 0 ? '+' : ''}${c.variance}d` : ''}{c.status === 'OVERDUE' && c.planned ? ` · ${Math.round((Date.parse(asOf) - Date.parse(c.planned)) / 864e5)}d` : ''}</span>
                        <span className="ml-auto flex items-center gap-3 text-[12.5px] num">
                          <span style={{ color: 'var(--muted)' }}>Plan {fmt(c.planned, true)}{c.baseline && c.planned !== c.baseline ? <s> {fmt(c.baseline, true)}</s> : null}</span>
                          <span className="font-semibold w-[52px] text-right">{fmt(c.actual, true)}</span>
                          <span className="w-[122px] text-right"><Provenance p={c.provenance} conf={c.record?.confidence} small /></span>
                          <ChevronDown size={14} className={cx('transition-transform', isOpen && 'rotate-180')} style={{ color: 'var(--faint)' }} />
                        </span>
                      </div>
                      {c.cycle !== null && (() => { const prev = v.cells.slice(0, i).map((x) => !!x.actual).lastIndexOf(true); const allowed = v.cells.slice(prev, i).reduce((t, x) => t + x.sla, 0); return <div className="text-[11.5px] num mt-0.5" style={{ color: c.overSla ? 'var(--late)' : 'var(--faint)' }}>Step took {c.cycle}d · SLA {allowed}d · {c.overSla ? `${c.overSla}d over → ${m.owner}` : 'within SLA'}</div>; })()}
                    </button>
                    {isOpen && (
                      <div className="mt-2 ml-2 flex flex-col gap-2 anim-rise">
                        {evs.length === 0 && <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>{c.provenance === 'LEGACY' ? 'This date was typed by hand in the old tracker. No source evidence has been captured for it yet.' : `No evidence captured yet. Expected source: ${m.source}.`}</p>}
                        {evs.map((e) => <EvidenceCard key={e.id} e={e} chosen={c.record?.evidenceId === e.id} onOpen={() => setViewer(e)} />)}
                        {history.length > 0 && <div className="text-[12px] rounded-lg p-2.5" style={{ background: 'var(--sunken)' }}><b>Earlier values</b> (kept, never deleted): {history.map((h) => `${fmt(h.date, true)} (${h.source === 'LEGACY' ? 'legacy manual' : h.source.toLowerCase()}${h.round > 1 ? `, round ${h.round}` : ''})`).join(' · ')}</div>}
                        {rb.length > 0 && <div className="text-[12px]" style={{ color: 'var(--muted)' }}>Re-baselined: {rb.map((r) => `${fmt(r.date, true)} — ${r.reason}`).join('; ')}</div>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="grid md:grid-cols-2 gap-4">
          <section className="card p-4" aria-label="Bidders">
            <h3 className="font-semibold text-[14px] mb-2 flex items-center gap-2"><Users size={16} />Bidders</h3>
            {bidders.length === 0 ? <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>No bidders recorded in the Strategy sheet.</p> : (
              <ul className="flex flex-col gap-1.5">
                {bidders.map((b) => {
                  const ev = pkgEvents.filter((e) => e.supplier === b.vendor && e.decision === 'AUTO_COMMITTED');
                  const firstRfp = pkgEvents.find((e) => e.key === 'float_rfps' && docs.find((d) => d.id === e.docId)?.to.some((t) => t.email.includes(b.vendor.toLowerCase().replace(/[^a-z0-9]/g, ''))));
                  return (
                    <li key={b.vendor} className="flex items-center gap-2 text-[13px]">
                      <span className="flex-1 truncate">{b.vendor}{b.awarded && <span className="ml-1.5 text-[11px] rounded px-1.5 py-0.5" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>awarded</span>}</span>
                      <span className="text-[11.5px] num" style={{ color: 'var(--muted)' }}>{firstRfp ? `invited ${fmt(firstRfp.date, true)}` : ''}{ev.length ? ` · ${ev.length} replies` : ''}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {bidders.some((b) => b.synthetic) && <p className="text-[11.5px] mt-2" style={{ color: 'var(--faint)' }}>Bidder names are synthetic (the Strategy sheet has none for this package).</p>}
          </section>
          <Notes pkgId={id} notes={notes.filter((n) => n.pkgId === id)} />
        </div>

        <section className="card p-4" aria-label="Audit history">
          <h3 className="font-semibold text-[14px] mb-2 flex items-center gap-2"><History size={16} />Audit history</h3>
          {pkgAudit.length === 0 ? <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>No changes yet. Captures, corrections and denied attempts will appear here.</p> : (
            <ul className="flex flex-col gap-1.5 text-[12.5px]">
              {pkgAudit.map((a) => (
                <li key={a.seq} className="flex gap-2"><span className="num w-10 shrink-0" style={{ color: 'var(--faint)' }}>#{a.seq}</span>
                  <span className="flex-1"><b style={{ color: a.action.startsWith('DENIED') ? 'var(--over)' : undefined }}>{a.action.replace(/_/g, ' ').toLowerCase()}</b> · {a.entity.split(':')[1] ? MILESTONES.find((m) => m.key === a.entity.split(':')[1])?.name : ''} {a.after && typeof a.after === 'object' && 'date' in (a.after as object) ? `→ ${fmt((a.after as { date: string }).date, true)}` : ''} <span style={{ color: 'var(--faint)' }}>· {a.actor}</span></span>
                  <span className="num shrink-0" style={{ color: 'var(--faint)' }}>{new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AdminDialogs kind={dlg} onClose={() => setDlg(null)} pkgId={id} excluded={v.pkg.excluded} pkgEvents={pkgEvents} />
      <Dialog open={!!viewer} onClose={() => setViewer(null)} title="Source evidence">{viewer && docs.find((d) => d.id === viewer.docId) && <SourceViewer doc={docs.find((d) => d.id === viewer.docId)!} event={viewer} />}</Dialog>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className="rounded-lg p-3" style={{ background: 'var(--sunken)' }}><div className="label">{label}</div><div className="text-[17px] font-semibold num mt-0.5" style={{ color: tone }}>{value}</div>{sub && <div className="text-[11.5px] num" style={{ color: 'var(--muted)' }}>{sub}</div>}</div>;
}

function MiniRail({ cells }: { cells: ReturnType<typeof useViews>[number]['cells'] }) {
  return (
    <div className="mt-4 flex items-center" aria-hidden>
      {cells.map((c, i) => (
        <div key={c.key} className="flex items-center flex-1 last:flex-none">
          <span className="h-3 w-3 rounded-full shrink-0" title={`${MILESTONES[i].name}: ${STATUS[c.status].label}`}
            style={{ background: c.actual ? STATUS[c.status].fg : 'var(--surface)', border: c.actual ? 'none' : `2px ${c.status === 'NOT_APPLICABLE' ? 'dashed' : 'solid'} ${c.status === 'OVERDUE' || c.status === 'SKIPPED_MISSING' ? 'var(--over)' : c.status === 'DUE_SOON' ? 'var(--soon)' : 'var(--line-strong)'}` }} />
          {i < 14 && <span className="h-[2px] flex-1" style={{ background: cells[i + 1].actual ? STATUS[cells[i + 1].status].fg : 'var(--rail)', opacity: cells[i + 1].actual ? 0.5 : 1 }} />}
        </div>
      ))}
    </div>
  );
}

function EvidenceCard({ e, chosen, onOpen }: { e: EvidenceEvent; chosen: boolean; onOpen: () => void }) {
  const doc = useStore((s) => s.docs.find((d) => d.id === e.docId));
  if (!doc) return null;
  const Icon = KIND_ICON[doc.kind];
  return (
    <div className="rounded-lg p-3 text-[12.5px]" style={{ border: `1px solid ${chosen ? 'var(--teal)' : 'var(--line)'}`, background: 'var(--surface)' }}>
      <div className="flex items-start gap-2">
        <Icon size={15} style={{ color: 'var(--teal)', marginTop: 1 }} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate" dir="auto">{doc.subject || doc.attachments[0]?.name || doc.fileName}</div>
          <div className="truncate num" style={{ color: 'var(--muted)' }}>{doc.kind === 'email' ? doc.from.email : `${doc.kind} event`} · {fmt(e.date)}{doc.sentAt && dubaiDate(doc.sentAt) !== doc.sentAt.slice(0, 10) ? ' (UTC date differs — Dubai date used)' : ''}{e.round > 1 ? ` · round ${e.round}` : ''}</div>
        </div>
        {chosen && <span className="text-[11px] rounded px-1.5 py-0.5 shrink-0" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>sets the date</span>}
        <span className="flex items-center gap-1.5 shrink-0"><Meter value={e.confidence} tone={confTone(e.confidence)} w={40} /><span className="num">{Math.round(e.confidence * 100)}%</span></span>
      </div>
      {(e.ruleHits.length > 0 || e.ai) && (
        <div className="mt-2 grid gap-1 text-[12px]" style={{ color: 'var(--muted)' }}>
          {e.ruleHits.length > 0 && <div><span className="font-medium" style={{ color: 'var(--ink)' }}>Rules:</span> {e.ruleHits.join(' · ')}</div>}
          {e.ai && <div className="flex gap-1"><Bot size={13} className="shrink-0 mt-0.5" /><span><span className="font-medium" style={{ color: 'var(--ink)' }}>AI:</span> {e.ai.rationale}</span></div>}
          {e.resolution && <div><span className="font-medium" style={{ color: 'var(--ink)' }}>Admin:</span> {e.resolution} ({e.resolvedBy})</div>}
          {e.flags.filter((f) => !f.includes(':')).length > 0 && <div>Flags: {e.flags.filter((f) => !f.includes(':')).join(', ').toLowerCase().replace(/_/g, ' ')}</div>}
        </div>
      )}
      <button className="btn btn-sm mt-2" onClick={onOpen}>Open source</button>
    </div>
  );
}

function Notes({ pkgId, notes }: { pkgId: string; notes: { id: string; author: string; text: string; at: string }[] }) {
  const { addNote, role, toast } = useStore();
  const [t, setT] = useState('');
  return (
    <section className="card p-4" aria-label="Delay notes">
      <h3 className="font-semibold text-[14px] mb-1 flex items-center gap-2"><MessageSquarePlus size={16} />Delay notes</h3>
      <p className="text-[12px] mb-2" style={{ color: 'var(--muted)' }}>Context for leadership. Notes never change dates.</p>
      <ul className="flex flex-col gap-2 mb-2 max-h-40 overflow-y-auto">{notes.map((n) => <li key={n.id} className="text-[12.5px] rounded-lg p-2" style={{ background: 'var(--sunken)' }}>{n.text}<div className="text-[11px] mt-0.5" style={{ color: 'var(--faint)' }}>{n.author} · {new Date(n.at).toLocaleString()}</div></li>)}</ul>
      {role !== 'leadership' ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); try { addNote(pkgId, t); setT(''); } catch (err) { toast({ tone: 'error', title: (err as Error).message }); } }}>
          <input className="input flex-1" value={t} onChange={(e) => setT(e.target.value)} placeholder="e.g. Waiting on revised drawings from consultant" aria-label="Delay note" />
          <button className="btn" disabled={!t.trim()}>Add note</button>
        </form>
      ) : <p className="text-[12px]" style={{ color: 'var(--faint)' }}>Leadership view is read-only.</p>}
    </section>
  );
}

function AdminDialogs({ kind, onClose, pkgId, excluded, pkgEvents }: { kind: null | 'correct' | 'rebase' | 'exclude'; onClose: () => void; pkgId: string; excluded: boolean; pkgEvents: EvidenceEvent[] }) {
  const { correctDate, rebaseline, toggleExclude, toast, role, docs } = useStore();
  const [key, setKey] = useState<MilestoneKey>('award_issued');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [err, setErr] = useState('');
  const run = (fn: () => void) => { try { setErr(''); fn(); onClose(); setReason(''); setDate(''); setEvidence(''); } catch (e) { const m = (e as Error).message; setErr(m); if (m.startsWith('403')) toast({ tone: 'error', title: 'Not allowed (403)', body: 'The server refused the change and wrote the attempt to the audit log.' }); } };
  const nonAdmin = role !== 'admin';
  const banner = nonAdmin && <div className="mb-3 text-[12.5px] rounded-lg p-2.5 flex gap-2" style={{ background: 'var(--over-bg)', color: 'var(--over)' }}><Lock size={14} className="shrink-0 mt-0.5" />You are signed in as {PEOPLE[role].title}. Dates can only be changed by the administrator; the server will refuse and log this attempt.</div>;
  const evOptions = pkgEvents.filter((e) => e.decision === 'AUTO_COMMITTED' || e.decision === 'QUEUED');
  if (kind === 'correct') return (
    <Dialog open onClose={onClose} title="Correct a milestone date" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => run(() => correctDate(pkgId, key, date, reason, evidence))}>Save correction</button></>}>
      {banner}
      <div className="grid gap-3">
        <label className="grid gap-1"><span className="label">Milestone</span><select className="input" value={key} onChange={(e) => setKey(e.target.value as MilestoneKey)}>{MILESTONES.map((m) => <option key={m.key} value={m.key}>{m.code} · {m.name}</option>)}</select></label>
        <label className="grid gap-1"><span className="label">Correct date (Asia/Dubai)</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="grid gap-1"><span className="label">Evidence (required)</span><select className="input" value={evidence} onChange={(e) => setEvidence(e.target.value)}><option value="">Choose a captured document…</option>{evOptions.map((e) => { const d = docs.find((x) => x.id === e.docId); return <option key={e.id} value={e.id}>{fmt(e.date, true)} · {d?.subject || d?.fileName}</option>; })}<option value="upload:manual-evidence.pdf">Upload new evidence (POC: placeholder)</option></select></label>
        <label className="grid gap-1"><span className="label">Reason (required)</span><textarea className="input py-2 h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the captured date wrong?" /></label>
        <p className="text-[12px]" style={{ color: 'var(--muted)' }}>The current value is kept and marked as superseded. Both stay visible, and the change is written to the hash-chained audit log.</p>
        {err && !err.startsWith('403') && <p className="text-[12.5px]" style={{ color: 'var(--over)' }} role="alert">{err}</p>}
      </div>
    </Dialog>
  );
  if (kind === 'rebase') return (
    <Dialog open onClose={onClose} title="Re-baseline a planned date" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => run(() => rebaseline(pkgId, key, date, reason))}>Re-baseline</button></>}>
      {banner}
      <div className="grid gap-3">
        <label className="grid gap-1"><span className="label">Milestone</span><select className="input" value={key} onChange={(e) => setKey(e.target.value as MilestoneKey)}>{MILESTONES.map((m) => <option key={m.key} value={m.key}>{m.code} · {m.name}</option>)}</select></label>
        <label className="grid gap-1"><span className="label">New planned date</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="grid gap-1"><span className="label">Reason (required)</span><textarea className="input py-2 h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Scope change agreed with project director on 12 May" /></label>
        {err && !err.startsWith('403') && <p className="text-[12.5px]" style={{ color: 'var(--over)' }} role="alert">{err}</p>}
      </div>
    </Dialog>
  );
  if (kind === 'exclude') return (
    <Dialog open onClose={onClose} title={excluded ? 'Include package in metrics' : 'Exclude package from metrics'} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!reason.trim()} onClick={() => run(() => toggleExclude(pkgId, reason))}>{excluded ? 'Include' : 'Exclude'}</button></>}>
      {banner}
      <label className="grid gap-1"><span className="label">Reason (required)</span><textarea className="input py-2 h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Handled by Dutco MEP division" /></label>
    </Dialog>
  );
  return null;
}
