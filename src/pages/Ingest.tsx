import { useRef, useState } from 'react';
import { UploadCloud, Play, RotateCcw, Wand2, FileSpreadsheet, CheckCircle2, Inbox, EyeOff, Copy, XCircle, Mail, FolderOpen, FileSignature, Landmark, Lock } from 'lucide-react';
import { useStore } from '@/store/store';
import { go } from '@/lib/hooks';
import { PageHeader, Section, cx, Empty } from '@/components/ui';
import { parseEml, parseEventFile } from '@/lib/parsers';
import { fmt } from '@/domain/dates';
import { MILESTONES } from '@/domain/milestones';

const STAGES = ['Ingest & hash', 'Normalise', 'Filter noise', 'De-duplicate', 'Thread', 'Extract cues', 'Rules + AI', 'Decide & validate'];
const OUTCOMES = [
  { d: 'AUTO_COMMITTED', label: 'Auto-committed', Icon: CheckCircle2, c: 'var(--ok)', to: 'evidence' as const },
  { d: 'QUEUED', label: 'Exception queue', Icon: Inbox, c: 'var(--soon)', to: 'exceptions' as const },
  { d: 'IGNORED', label: 'Ignored', Icon: EyeOff, c: 'var(--up)', to: 'evidence' as const },
  { d: 'DUPLICATE', label: 'Duplicates', Icon: Copy, c: 'var(--up)', to: 'evidence' as const },
  { d: 'ERROR', label: 'Errors', Icon: XCircle, c: 'var(--over)', to: 'evidence' as const },
];

export default function Ingest() {
  const { synth, docs, events, ingest, processAll, generate, reset, importFile, addUploads, role, report, packages, toast, settings } = useStore();
  const [seed, setSeed] = useState(42);
  const [drag, setDrag] = useState(false);
  const [fileLog, setFileLog] = useState<{ name: string; ok: boolean; msg: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  if (role !== 'admin') return <div className="card"><Empty icon={<Lock size={20} />} title="Ingestion is admin-only" body="Switch to the Admin role in the top bar to import schedules and process mailboxes." /></div>;

  const pct = ingest.total ? ingest.done / ingest.total : 0;
  const count = (d: string) => events.filter((e) => e.decision === d).length;
  const kinds = { email: 0, sharepoint: 0, docusign: 0, obt: 0 } as Record<string, number>;
  synth?.docs.forEach((d) => { kinds[d.kind]++; });
  const recent = [...events].slice(-9).reverse();
  const run = () => processAll().catch((e) => toast({ tone: 'error', title: (e as Error).message }));

  const onFiles = async (files: FileList | File[]) => {
    const log: typeof fileLog = [];
    const uploaded = [];
    for (const f of Array.from(files)) {
      const n = f.name.toLowerCase();
      try {
        if (n.endsWith('.xlsm') || n.endsWith('.xlsx')) { importFile(await f.arrayBuffer(), f.name); log.push({ name: f.name, ok: true, msg: 'Schedule imported' }); }
        else if (n.endsWith('.eml')) { uploaded.push(parseEml(await f.text(), f.name)); log.push({ name: f.name, ok: true, msg: 'Queued for processing' }); }
        else if (n.endsWith('.json') || n.endsWith('.csv')) { const evs = parseEventFile(await f.text(), f.name); uploaded.push(...evs); log.push({ name: f.name, ok: true, msg: `${evs.length} events queued` }); }
        else if (n.endsWith('.msg')) log.push({ name: f.name, ok: false, msg: 'Outlook .msg is parsed by the Node ingestion service (server/). In this browser demo, export as .eml.' });
        else log.push({ name: f.name, ok: false, msg: 'Unsupported file type' });
      } catch (e) { log.push({ name: f.name, ok: false, msg: (e as Error).message }); }
    }
    if (uploaded.length) { addUploads(uploaded); }
    setFileLog(log);
  };

  return (
    <div>
      <PageHeader title="Ingest" desc="Drop the schedule and the mailbox. The Control Tower reads, matches and commits — nobody types a date."
        actions={<>
          <button className="btn" onClick={() => reset()} disabled={ingest.running}><RotateCcw size={15} />Reset demo</button>
          <button className="btn btn-teal" onClick={run} disabled={ingest.running}><Play size={15} />{ingest.done && !ingest.running ? 'Process again' : 'Process mailbox'}</button>
        </>} />

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 mb-4">
        <Section title="Capture pipeline" desc={ingest.running ? `Processing ${ingest.done} of ${ingest.total}…` : ingest.done ? `Processed ${ingest.done} files in ${((ingest.finishedAt! - ingest.startedAt!) / 1000).toFixed(1)}s (slowed down for the demo)` : `${synth?.docs.length ?? 0} files waiting in the demo mailbox`}>
          <div className="relative">
            <svg className="absolute left-0 right-0 top-[19px] w-full h-[4px]" preserveAspectRatio="none" viewBox="0 0 100 4" aria-hidden>
              <line x1="4" x2="96" y1="2" y2="2" stroke="var(--rail)" strokeWidth="4" />
              <line x1="4" x2={4 + 92 * pct} y1="2" y2="2" stroke="var(--teal)" strokeWidth="4" />
              {ingest.running && <line x1="4" x2="96" y1="2" y2="2" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeDasharray="2 6" style={{ animation: 'flow .6s linear infinite' }} />}
            </svg>
            <ol className="relative grid grid-cols-4 sm:grid-cols-8 gap-y-4">
              {STAGES.map((s, i) => {
                const lit = ingest.running ? i <= ingest.stage || pct > 0.98 : ingest.done > 0;
                return (
                  <li key={s} className="flex flex-col items-center text-center px-1">
                    <span className="h-10 w-10 rounded-full grid place-items-center text-[12px] font-semibold num relative transition-colors" style={{ background: lit ? 'var(--teal)' : 'var(--surface)', color: lit ? '#fff' : 'var(--muted)', border: `2px solid ${lit ? 'var(--teal)' : 'var(--line-strong)'}` }}>
                      {i + 1}{ingest.running && i === ingest.stage && <span className="absolute inset-0 rounded-full" style={{ border: '2px solid var(--teal)', animation: 'pulse-dot 1s infinite' }} />}
                    </span>
                    <span className="text-[11.5px] mt-1.5 leading-tight" style={{ color: lit ? 'var(--ink)' : 'var(--muted)' }}>{s}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="mt-4 h-9 rounded-lg px-3 flex items-center text-[12.5px] truncate" style={{ background: 'var(--sunken)', color: 'var(--muted)' }} dir="auto" aria-live="polite">
            {ingest.running ? <>Reading <b className="mx-1" style={{ color: 'var(--ink)' }}>{ingest.current}</b></> : ingest.done ? 'Done. Captured dates now appear in the schedule with System provenance.' : 'Ready. Emails, SharePoint, DocuSign and OBT files are processed in time order.'}
          </div>
          <div className="grid grid-cols-5 gap-2 mt-3">
            {OUTCOMES.map((o) => (
              <button key={o.d} onClick={() => go(o.to)} className="rounded-lg p-2.5 text-left hover:bg-[var(--sunken)]" style={{ border: '1px solid var(--line)' }}>
                <o.Icon size={15} style={{ color: o.c }} /><div className="text-[22px] font-semibold num leading-tight mt-1">{count(o.d)}</div><div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{o.label}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Live feed" desc="Each decision with its reason." pad={false}>
          <ul className="px-4 pb-3 flex flex-col">
            {recent.length === 0 && <li className="text-[12.5px] py-6 text-center" style={{ color: 'var(--muted)' }}>Decisions appear here as files are processed.</li>}
            {recent.map((e) => {
              const d = docs.find((x) => x.id === e.docId);
              const o = OUTCOMES.find((x) => x.d === e.decision)!;
              return (
                <li key={e.id} className="anim-rise flex items-center gap-2.5 py-1.5 text-[12.5px]" style={{ borderTop: '1px solid var(--line)' }}>
                  <o.Icon size={14} style={{ color: o.c, flex: 'none' }} />
                  <span className="truncate flex-1" dir="auto">{d?.subject || d?.fileName}</span>
                  <span className="shrink-0 text-[11.5px]" style={{ color: 'var(--muted)' }}>{e.decision === 'AUTO_COMMITTED' ? MILESTONES.find((m) => m.key === e.key)?.short ?? 'sub-event' : e.reason?.replace(/_/g, ' ').toLowerCase() ?? e.decision.toLowerCase()}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Section title="Drop files" desc=".xlsm/.xlsx schedule · .eml emails · SharePoint/DocuSign .json · OBT .csv">
          <button onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
            className={cx('w-full rounded-xl py-8 flex flex-col items-center gap-2 transition-colors', drag && 'scale-[1.01]')} style={{ border: `2px dashed ${drag ? 'var(--teal)' : 'var(--line-strong)'}`, background: drag ? 'var(--teal-soft)' : 'var(--sunken)' }}>
            <UploadCloud size={26} style={{ color: 'var(--teal)' }} /><span className="font-medium text-[13.5px]">Drop files or a folder here</span><span className="text-[12px]" style={{ color: 'var(--muted)' }}>or click to browse — bad files are reported, the rest continue</span>
          </button>
          <input ref={input} type="file" multiple hidden accept=".xlsm,.xlsx,.eml,.msg,.json,.csv" onChange={(e) => e.target.files && onFiles(e.target.files)} />
          {fileLog.length > 0 && <ul className="mt-3 flex flex-col gap-1 text-[12.5px]">{fileLog.map((f) => <li key={f.name} className="flex gap-2">{f.ok ? <CheckCircle2 size={14} style={{ color: 'var(--ok)' }} className="shrink-0 mt-0.5" /> : <XCircle size={14} style={{ color: 'var(--over)' }} className="shrink-0 mt-0.5" />}<span><b>{f.name}</b> — {f.msg}</span></li>)}</ul>}
        </Section>

        <Section title="Schedule import" desc="Sample_Project_Doc.xlsm, read directly — headers located by text.">
          {report && (
            <dl className="grid grid-cols-2 gap-y-1.5 text-[13px] num">
              <dt style={{ color: 'var(--muted)' }}>Packages</dt><dd className="font-semibold">{report.stats.packages}</dd>
              <dt style={{ color: 'var(--muted)' }}>Rows scanned</dt><dd>{report.stats.rowsScanned}</dd>
              <dt style={{ color: 'var(--muted)' }}>Legacy actual dates</dt><dd>{report.stats.legacyActuals}</dd>
              <dt style={{ color: 'var(--muted)' }}>Plans with target award</dt><dd>{report.stats.plannedAnchors}</dd>
              <dt style={{ color: 'var(--muted)' }}>Excluded (outside procurement)</dt><dd>{report.stats.excluded}</dd>
              <dt style={{ color: 'var(--muted)' }}>SLA master types</dt><dd>{Object.keys(report.slaMaster).length}</dd>
              <dt style={{ color: 'var(--muted)' }}>Reporting week</dt><dd>{fmt(report.project.reportingWeekEnding)}</dd>
            </dl>
          )}
          <ul className="mt-3 flex flex-col gap-1 text-[12px]" style={{ color: 'var(--muted)' }}>{report?.warnings.slice(0, 4).map((w, i) => <li key={i}>• {w.message}</li>)}</ul>
          <button className="btn btn-sm mt-3" onClick={() => go('quality')}><FileSpreadsheet size={14} />See data-quality findings</button>
        </Section>

        <Section title="Demo mailbox" desc="Synthetic, generated from the real schedule — clearly not Dutco’s emails.">
          <div className="grid grid-cols-4 gap-2 text-center mb-3">
            {[['email', Mail], ['sharepoint', FolderOpen], ['docusign', FileSignature], ['obt', Landmark]].map(([k, I]) => { const Icon = I as typeof Mail; return <div key={k as string} className="rounded-lg py-2" style={{ background: 'var(--sunken)' }}><Icon size={14} className="mx-auto" style={{ color: 'var(--teal)' }} /><div className="font-semibold num text-[16px]">{kinds[k as string]}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{k === 'obt' ? 'OBT' : k === 'docusign' ? 'DocuSign' : k === 'sharepoint' ? 'SharePoint' : 'Emails'}</div></div>; })}
          </div>
          <div className="text-[12px] mb-1.5" style={{ color: 'var(--muted)' }}>{packages.filter((p) => p.isDemo).length} POC packages · {synth?.edgeCases.length ?? 0} edge-case categories planted:</div>
          <div className="flex flex-wrap gap-1">{synth?.edgeCases.map((e) => <span key={e.id} title={e.title} className="text-[11px] num rounded px-1.5 py-0.5" style={{ background: 'var(--sunken)', border: '1px solid var(--line)' }}>{e.id}</span>)}</div>
          <div className="flex items-center gap-2 mt-3">
            <label className="label" htmlFor="seed">Seed</label><input id="seed" type="number" className="input w-20 num" value={seed} onChange={(e) => setSeed(+e.target.value || 1)} />
            <button className="btn btn-sm" disabled={ingest.running} onClick={() => { generate(seed); toast({ tone: 'info', title: 'New synthetic mailbox generated', body: `Seed ${seed} · previous capture results cleared (schedule kept).` }); }}><Wand2 size={14} />Regenerate</button>
          </div>
          <p className="text-[11.5px] mt-2" style={{ color: 'var(--faint)' }}>AI mode: {settings.aiOutage ? 'offline (degraded)' : 'simulated classifier — the Node service calls Claude when an API key is set.'}</p>
        </Section>
      </div>
    </div>
  );
}
