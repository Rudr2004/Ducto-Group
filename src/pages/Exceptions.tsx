import { useEffect, useMemo, useState } from 'react';
import { Inbox, Check, X, Split, Clock3, Bot, Gavel, Lock, CheckCheck } from 'lucide-react';
import { useStore } from '@/store/store';
import { MILESTONES, type MilestoneKey } from '@/domain/milestones';
import { diffDays, fmt } from '@/domain/dates';
import { Empty, Meter, PageHeader, confTone } from '@/components/ui';
import { SourceViewer } from '@/components/SourceViewer';
import type { ReasonCode } from '@/pipeline/types';

const REASON: Record<ReasonCode, { label: string; tone: string; explain: string }> = {
  AMBIGUOUS_PACKAGE: { label: 'Ambiguous package', tone: 'var(--soon)', explain: 'More than one package fits this message (shared reference code or a bidder invited on several packages) and nothing in it names the instance.' },
  DISAGREEMENT: { label: 'Rules vs AI disagree', tone: 'var(--late)', explain: 'The deterministic rules and the AI read this message differently. Nothing is committed until you decide.' },
  LOW_CONFIDENCE: { label: 'Low confidence', tone: 'var(--soon)', explain: 'The match is plausible but below the auto-commit threshold (e.g. a personal email domain).' },
  NO_ANCHOR: { label: 'No anchor', tone: 'var(--soon)', explain: 'No reference code, package name, known thread or known bidder ties this to a package.' },
  MULTI_PACKAGE: { label: 'Covers 2 packages', tone: 'var(--soon)', explain: 'The message names more than one package. Split it into one event per package.' },
  AI_UNAVAILABLE: { label: 'AI unavailable', tone: 'var(--up)', explain: 'The AI check could not run, so the rule match was not committed on its own.' },
  DOCUSIGN_DECLINED: { label: 'DocuSign declined', tone: 'var(--over)', explain: 'A TRF envelope was declined or voided. No milestone is set; the earlier "sent" event no longer counts.' },
  OBT_RETURNED: { label: 'OBT returned', tone: 'var(--over)', explain: 'The OBT submission was returned or rejected. The next resubmission becomes the milestone date.' },
  DATE_UNCERTAIN: { label: 'Date uncertain', tone: 'var(--soon)', explain: 'The message has no Date header; the received time was used, so the date needs a human check.' },
  OUT_OF_WINDOW: { label: 'Outside window', tone: 'var(--soon)', explain: 'The evidence is dated more than a year before the package was added.' },
};

export default function Exceptions() {
  const { events, docs, packages, role, asOf, snoozed, confirmException, dismissException, splitException, snooze, toast } = useStore();
  const items = useMemo(() => events.filter((e) => e.decision === 'QUEUED' && !snoozed.includes(e.id)), [events, snoozed]);
  const resolved = events.filter((e) => e.resolvedBy).length;
  const [sel, setSel] = useState(0);
  const [pick, setPick] = useState<{ pkgId: string; key: MilestoneKey } | null>(null);
  const cur = items[Math.min(sel, items.length - 1)];
  const doc = cur ? docs.find((d) => d.id === cur.docId) : undefined;
  const name = (id?: string | null) => packages.find((p) => p.id === id)?.name ?? '—';
  const admin = role === 'admin';

  useEffect(() => { setPick(cur?.pkgId && cur.key ? { pkgId: cur.pkgId, key: cur.key as MilestoneKey } : null); }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (fn: () => void) => { try { fn(); } catch (e) { toast({ tone: 'error', title: (e as Error).message }); } };
  const confirm = () => cur && act(() => confirmException(cur.id, pick && (pick.pkgId !== cur.pkgId || pick.key !== cur.key) ? pick : undefined));
  const cands = cur?.candidates.slice(0, 3) ?? [];

  useEffect(() => {
    if (!admin) return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea')) return;
      if (e.key === 'j' || e.key === 'ArrowDown') setSel((s) => Math.min(items.length - 1, s + 1));
      else if (e.key === 'k' || e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      else if (['1', '2', '3'].includes(e.key) && cands[+e.key - 1]) setPick({ pkgId: cands[+e.key - 1].pkgId, key: (pick?.key ?? cur?.key ?? 'initial_proposals_received') as MilestoneKey });
      else if (e.key === 'n' && cur) act(() => dismissException(cur.id, 'Not procurement-related'));
      else if (e.key === 'z' && cur) snooze(cur.id);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  // bulk: identical patterns (same reason + supplier + suggested milestone)
  const pattern = cur && items.filter((e) => e.reason === cur.reason && e.supplier && e.supplier === cur.supplier && e.key === cur.key);

  if (!admin) return <div><PageHeader title="Exception queue" desc="Items the system was not sure about." /><div className="card"><Empty icon={<Lock size={20} />} title="Handled by the administrator only" body="Package managers are never asked to review or confirm dates. Exceptions go to Jassim; you’ll see the outcome in the schedule with its evidence." /></div></div>;

  return (
    <div>
      <PageHeader title="Exception queue" desc="Only what the system could not decide on its own. One decision, audited, and the system learns from it."
        actions={<div className="hidden md:flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--muted)' }}><span className="kbd">J</span><span className="kbd">K</span> move <span className="kbd">Enter</span> confirm <span className="kbd">1–3</span> candidate <span className="kbd">N</span> not procurement <span className="kbd">Z</span> snooze</div>} />
      {items.length === 0 ? (
        <div className="card"><Empty icon={<CheckCheck size={20} />} title={events.length ? 'Queue is clear' : 'Nothing to review yet'} body={events.length ? `${resolved} item${resolved === 1 ? '' : 's'} resolved. Everything else was committed automatically or ignored with a reason.` : 'Process the demo mailbox on the Ingest page. Anything the system is unsure about lands here — never with the package managers.'} /></div>
      ) : (
        <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
          <ul className="card overflow-hidden lg:sticky lg:top-0" role="listbox" aria-label="Exceptions">
            {items.map((e, i) => {
              const d = docs.find((x) => x.id === e.docId);
              const r = REASON[e.reason!];
              const age = e.date ? diffDays(asOf, e.date) : 0;
              return (
                <li key={e.id} role="option" aria-selected={i === sel}>
                  <button onClick={() => setSel(i)} className="w-full text-left px-4 py-3 flex flex-col gap-1.5" style={{ borderBottom: '1px solid var(--line)', background: i === sel ? 'var(--sunken)' : undefined, boxShadow: i === sel ? 'inset 3px 0 var(--teal)' : undefined }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold rounded px-1.5 py-0.5" style={{ color: r.tone, background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>{r.label}</span>
                      <span className="ml-auto text-[11.5px] num" style={{ color: 'var(--faint)' }}>{e.date ? (age < 0 ? `dated ${fmt(e.date, true)}` : age === 0 ? 'today' : `${age}d ago`) : ''}</span>
                    </div>
                    <div className="text-[13px] font-medium truncate" dir="auto">{d?.subject || d?.fileName}</div>
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--muted)' }}>
                      <span className="truncate flex-1">{e.pkgId ? name(e.pkgId) : 'No package'}{e.key ? ` · ${MILESTONES.find((m) => m.key === e.key)?.short}` : ''}</span>
                      {e.flags.includes('CRITICAL') ? <span className="text-[11.5px] font-semibold" style={{ color: 'var(--over)' }}>critical · alert sent</span> : <><Meter value={e.confidence} tone={confTone(e.confidence)} w={44} /><span className="num w-8 text-right">{Math.round(e.confidence * 100)}%</span></>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {cur && doc && (
            <div className="card p-5 anim-rise" key={cur.id}>
              <div className="rounded-lg p-3 mb-4 text-[13px]" style={{ background: 'var(--sunken)' }}>
                <div className="font-semibold mb-0.5" style={{ color: REASON[cur.reason!].tone }}>{REASON[cur.reason!].label}</div>{REASON[cur.reason!].explain}
              </div>
              <div className="grid md:grid-cols-2 gap-3 mb-4 text-[12.5px]">
                <div className="rounded-lg p-3" style={{ border: '1px solid var(--line)' }}>
                  <div className="font-semibold mb-1 flex items-center gap-1.5"><Gavel size={14} />Rules saw</div>
                  {cur.ruleHits.length ? <ul className="flex flex-col gap-0.5" style={{ color: 'var(--muted)' }}>{cur.ruleHits.map((h) => <li key={h}>• {h}</li>)}</ul> : <span style={{ color: 'var(--muted)' }}>No deterministic anchor.</span>}
                  {cur.ruleMilestone && <div className="mt-1.5">Milestone: <b>{MILESTONES.find((m) => m.key === cur.ruleMilestone)?.name}</b></div>}
                </div>
                <div className="rounded-lg p-3" style={{ border: '1px solid var(--line)' }}>
                  <div className="font-semibold mb-1 flex items-center gap-1.5"><Bot size={14} />AI read{cur.ai?.provider === 'simulated' && <span className="font-normal text-[11px]" style={{ color: 'var(--faint)' }}>(simulated)</span>}</div>
                  {cur.ai ? <><p style={{ color: 'var(--muted)' }}>{cur.ai.rationale}</p><div className="mt-1.5">Milestone: <b>{cur.ai.milestone === 'none' ? 'none' : MILESTONES.find((m) => m.key === cur.ai!.milestone)?.name}</b> · package <b>{name(cur.ai.pkgId)}</b></div></> : <span style={{ color: 'var(--muted)' }}>Not available for this item.</span>}
                  {cur.flags.includes('PROMPT_INJECTION') && <div className="mt-1.5" style={{ color: 'var(--over)' }}>Instruction-like text in the email was ignored.</div>}
                </div>
              </div>

              {!['DOCUSIGN_DECLINED', 'OBT_RETURNED'].includes(cur.reason!) && (
                <div className="mb-4">
                  <div className="label mb-1.5">Package (press 1–3)</div>
                  <div className="flex flex-col gap-1.5">
                    {cands.map((c, i) => (
                      <label key={c.pkgId} className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer text-[13px]" style={{ border: `1px solid ${pick?.pkgId === c.pkgId ? 'var(--teal)' : 'var(--line)'}`, background: pick?.pkgId === c.pkgId ? 'var(--teal-soft)' : undefined }}>
                        <input type="radio" name="cand" checked={pick?.pkgId === c.pkgId} onChange={() => setPick({ pkgId: c.pkgId, key: (pick?.key ?? cur.key ?? 'initial_proposals_received') as MilestoneKey })} />
                        <span className="kbd">{i + 1}</span><span className="flex-1 font-medium">{name(c.pkgId)}</span>
                        <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{c.anchors.map((a) => a.toLowerCase().replace(/_/g, ' ')).join(', ')}</span>
                        <Meter value={Math.min(1, c.score)} tone={confTone(c.score)} w={40} />
                      </label>
                    ))}
                    <select className="input" value={cands.some((c) => c.pkgId === pick?.pkgId) ? '' : pick?.pkgId ?? ''} onChange={(e) => e.target.value && setPick({ pkgId: e.target.value, key: (pick?.key ?? cur.key ?? 'initial_proposals_received') as MilestoneKey })} aria-label="Choose another package">
                      <option value="">Another package…</option>{packages.filter((p) => p.isDemo).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <label className="grid gap-1 mt-3"><span className="label">Milestone</span>
                    <select className="input" value={pick?.key ?? ''} onChange={(e) => pick && setPick({ ...pick, key: e.target.value as MilestoneKey })}>{MILESTONES.map((m) => <option key={m.key} value={m.key}>{m.code} · {m.name}</option>)}</select>
                  </label>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-5">
                <button className="btn btn-primary" onClick={confirm}><Check size={15} />{['DOCUSIGN_DECLINED', 'OBT_RETURNED'].includes(cur.reason!) ? 'Acknowledge' : pick && (pick.pkgId !== cur.pkgId || pick.key !== cur.key) ? 'Confirm my choice' : 'Confirm suggestion'}<span className="kbd ml-1" style={{ background: 'transparent', color: 'inherit', borderColor: 'currentColor', opacity: 0.6 }}>↵</span></button>
                <button className="btn" onClick={() => act(() => dismissException(cur.id, 'Not procurement-related'))}><X size={15} />Not procurement-related</button>
                {(cur.reason === 'MULTI_PACKAGE' || cur.reason === 'AMBIGUOUS_PACKAGE') && cands.length > 1 && <button className="btn" onClick={() => act(() => splitException(cur.id, cands.slice(0, 2).map((c) => c.pkgId), (pick?.key ?? cur.key ?? 'float_rfps') as MilestoneKey))}><Split size={15} />Split to {name(cands[0].pkgId)} + {name(cands[1].pkgId)}</button>}
                <button className="btn btn-ghost" onClick={() => snooze(cur.id)}><Clock3 size={15} />Snooze</button>
                {pattern && pattern.length > 1 && <button className="btn" onClick={() => act(() => pattern.forEach((p) => confirmException(p.id, pick ?? undefined)))}><CheckCheck size={15} />Confirm all {pattern.length} like this</button>}
              </div>

              <div className="rounded-xl p-4" style={{ border: '1px solid var(--line)' }}>
                <div className="label mb-2">Source — cues that drove the match are highlighted · evidence date {fmt(cur.date)}</div>
                <SourceViewer doc={doc} event={cur} />
              </div>
            </div>
          )}
        </div>
      )}
      {items.length === 0 && events.length > 0 && <div className="mt-4 text-[12.5px] flex items-center gap-2" style={{ color: 'var(--muted)' }}><Inbox size={14} />Resolved items stay in the Evidence log and Audit log with who decided and why.</div>}
    </div>
  );
}
