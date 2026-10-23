import { useEffect, useState } from 'react';
import { Play, Target, ShieldCheck } from 'lucide-react';
import { useStore } from '@/store/store';
import { MILESTONES } from '@/domain/milestones';
import { Empty, PageHeader, Section } from '@/components/ui';

const pct = (v: number) => `${(v * 100).toFixed(v === 1 ? 0 : 1)}%`;
const DEC = ['AUTO_COMMITTED', 'QUEUED', 'IGNORED', 'DUPLICATE', 'ERROR'];

export default function Accuracy() {
  const { evalRuns, runEval, role, toast, packages, synth } = useStore();
  const [seed, setSeed] = useState(42);
  useEffect(() => { if (!evalRuns.length && role === 'admin') { try { runEval(42); } catch { /* ignore */ } } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = evalRuns[0];
  const go = () => { try { runEval(seed); toast({ tone: 'ok', title: 'Evaluation complete', body: `Seed ${seed} · clean database · ${run?.metrics.docs ?? ''} documents` }); } catch (e) { toast({ tone: 'error', title: (e as Error).message }); } };

  return (
    <div>
      <PageHeader title="Accuracy" desc="The pipeline replayed from a clean database against known ground truth. This is how “foolproof” is measured, not claimed."
        actions={<><label className="label" htmlFor="es">Seed</label><input id="es" type="number" className="input w-20 num" value={seed} onChange={(e) => setSeed(+e.target.value || 1)} /><button className="btn btn-primary" onClick={go} disabled={role !== 'admin'}><Play size={15} />Run evaluation</button></>} />
      {!run ? <div className="card"><Empty icon={<Target size={20} />} title="No evaluation run yet" body="An administrator runs the evaluation; it never touches live data." /></div> : (() => {
        const m = run.metrics;
        const big = [
          { l: 'Milestone-date accuracy', v: pct(m.dateAccuracy), s: `${m.correctDates} of ${m.expectedDates} expected dates · target ≥ 98%`, ok: m.dateAccuracy >= 0.98 },
          { l: 'Auto-commit precision', v: pct(m.autoPrecision), s: `${m.autoCorrect} of ${m.autoCommitted} commits correct · target 100%`, ok: m.autoPrecision === 1 },
          { l: 'Silent wrong commits', v: String(m.autoCommitted - m.autoCorrect), s: 'Errors either do not happen or land in the queue', ok: m.autoCommitted === m.autoCorrect },
          { l: 'Sent to exception queue', v: String(m.queued), s: `${pct(m.queued / m.docs)} of ${m.docs} documents`, ok: true },
        ];
        return <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
            {big.map((b) => (
              <div key={b.l} className="card p-4">
                <div className="label flex items-center gap-1.5">{b.l}</div>
                <div className="text-[34px] font-semibold num leading-tight mt-1 flex items-center gap-2" style={{ color: b.ok ? 'var(--ok)' : 'var(--over)' }}>{b.v}{b.ok && <ShieldCheck size={22} />}</div>
                <div className="text-[12px]" style={{ color: 'var(--muted)' }}>{b.s}</div>
              </div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Section title="Classification quality">
              <table className="w-full text-[13px] num"><tbody>
                {[['Package match precision', m.pkgPrecision], ['Package match recall', m.pkgRecall], ['Milestone precision', m.msPrecision], ['Milestone recall', m.msRecall], ['Date coverage (auto)', m.coverage]].map(([l, v]) => (
                  <tr key={l as string} style={{ borderTop: '1px solid var(--line)' }}><td className="py-2">{l}</td><td className="py-2 w-40"><span className="block h-2 rounded-full" style={{ background: 'var(--sunken)' }}><span className="block h-2 rounded-full" style={{ width: `${(v as number) * 100}%`, background: 'var(--teal)' }} /></span></td><td className="py-2 text-right font-semibold w-16">{pct(v as number)}</td></tr>
                ))}
              </tbody></table>
              <p className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>Recall below 100% is by design: ambiguous items are queued for the administrator rather than guessed.</p>
            </Section>
            <Section title="Confusion matrix" desc="Rows = expected outcome · columns = what the pipeline did">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] num">
                  <thead><tr><th />{DEC.map((d) => <th key={d} className="font-medium px-1.5 py-1.5 text-right" style={{ color: 'var(--muted)' }}>{d.split('_')[0].toLowerCase()}</th>)}</tr></thead>
                  <tbody>{DEC.map((r) => (
                    <tr key={r} style={{ borderTop: '1px solid var(--line)' }}><td className="py-1.5 pr-2 font-medium">{r.split('_')[0].toLowerCase()}</td>
                      {DEC.map((c) => { const n = m.confusion[r]?.[c] ?? 0; return <td key={c} className="text-right px-1.5 py-1.5" style={{ background: n ? (r === c ? 'var(--ok-bg)' : r === 'AUTO_COMMITTED' && c === 'QUEUED' ? 'var(--soon-bg)' : 'var(--over-bg)') : undefined, color: n ? 'var(--ink)' : 'var(--faint)', fontWeight: n ? 600 : 400 }}>{n}</td>; })}</tr>
                  ))}</tbody>
                </table>
              </div>
            </Section>
          </div>
          <Section title={`Mismatches · ${m.mismatches.length}`} desc="Every disagreement with ground truth, listed in full." pad={false}>
            {m.mismatches.length === 0 ? <p className="px-4 pb-4 text-[13px]" style={{ color: 'var(--muted)' }}>None. Every expected date was captured correctly and every queued item was meant to be queued.</p> : (
              <table className="w-full text-[13px]"><tbody>{m.mismatches.map((x, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--line)' }}><td className="px-4 py-2">{x.kind}</td><td className="py-2">{packages.find((p) => p.id === x.pkgId)?.name ?? synth?.docs.find((d) => d.id === x.docId)?.subject ?? x.docId}</td><td className="py-2">{MILESTONES.find((mm) => mm.key === x.key)?.name ?? ''}</td><td className="py-2 num">expected {x.expected}</td><td className="py-2 pr-4 num">got {x.got}</td></tr>
              ))}</tbody></table>
            )}
          </Section>
          <p className="text-[12px] mt-3" style={{ color: 'var(--faint)' }}>Run {run.id} · seed {run.seed} · {new Date(m.at).toLocaleString()} · synthetic dataset generated from the Dutco schedule. Real Dutco emails drop into the same evaluation unchanged once labelled.</p>
        </>;
      })()}
    </div>
  );
}
