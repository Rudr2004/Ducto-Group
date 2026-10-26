import { useMemo, useState } from 'react';
import { Search, FileSearch } from 'lucide-react';
import { useStore } from '@/store/store';
import { MILESTONES } from '@/domain/milestones';
import { fmt } from '@/domain/dates';
import { Dialog, Empty, Meter, PageHeader, Segmented, confTone } from '@/components/ui';
import { KIND_ICON, SourceViewer } from '@/components/SourceViewer';
import type { EvidenceEvent } from '@/pipeline/types';
import { go } from '@/lib/hooks';

const DEC = { AUTO_COMMITTED: ['Committed', 'var(--ok)'], QUEUED: ['Queued', 'var(--soon)'], IGNORED: ['Ignored', 'var(--up)'], DUPLICATE: ['Duplicate', 'var(--up)'], ERROR: ['Error', 'var(--over)'] } as const;

export default function Evidence() {
  const { events, docs, packages, role } = useStore();
  const [d, setD] = useState<'all' | keyof typeof DEC>('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState<EvidenceEvent | null>(null);
  const rows = useMemo(() => events.filter((e) => d === 'all' || e.decision === d).filter((e) => {
    if (!q) return true;
    const doc = docs.find((x) => x.id === e.docId);
    return `${doc?.subject} ${doc?.from.email} ${packages.find((p) => p.id === e.pkgId)?.name}`.toLowerCase().includes(q.toLowerCase());
  }).slice().reverse(), [events, d, q, docs, packages]);

  return (
    <div>
      <PageHeader title="Evidence log" desc="Every document the Control Tower read, what it decided, and why." />
      {events.length === 0 ? <div className="card"><Empty icon={<FileSearch size={20} />} title="No documents ingested yet" body={role === 'admin' ? 'Process the demo mailbox to fill this log.' : 'The administrator has not processed any documents yet.'} action={role === 'admin' ? <button className="btn btn-primary" onClick={() => go('ingest')}>Go to Ingest</button> : undefined} /></div> : <>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Segmented label="Decision" value={d} onChange={setD} options={[{ value: 'all', label: `All ${events.length}` }, ...Object.entries(DEC).map(([k, [l]]) => ({ value: k as keyof typeof DEC, label: `${l} ${events.filter((e) => e.decision === k).length}` }))]} />
          <label className="flex items-center gap-2 input ml-auto w-full sm:w-72"><Search size={15} style={{ color: 'var(--faint)' }} /><input className="bg-transparent outline-none flex-1" placeholder="Subject, sender, package" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search evidence" /></label>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[12px]" style={{ color: 'var(--muted)' }}><th className="font-medium px-4 py-2">Source</th><th className="font-medium py-2">Date</th><th className="font-medium py-2">Package · milestone</th><th className="font-medium py-2">Decision</th><th className="font-medium py-2 pr-4">Why</th></tr></thead>
            <tbody>
              {rows.slice(0, 300).map((e) => {
                const doc = docs.find((x) => x.id === e.docId);
                const Icon = doc ? KIND_ICON[doc.kind] : FileSearch;
                const [label, c] = DEC[e.decision];
                return (
                  <tr key={e.id} className="hover:bg-[var(--sunken)] cursor-pointer" style={{ borderTop: '1px solid var(--line)' }} onClick={() => setView(e)}>
                    <td className="px-4 py-2 max-w-[320px]"><div className="flex items-center gap-2"><Icon size={14} style={{ color: 'var(--teal)', flex: 'none' }} /><span className="truncate" dir="auto">{doc?.subject || doc?.fileName}</span></div><div className="text-[11.5px] truncate pl-[22px]" style={{ color: 'var(--faint)' }}>{doc?.kind === 'email' ? doc.from.email : doc?.fileName}</div></td>
                    <td className="py-2 num whitespace-nowrap">{fmt(e.date, true)}</td>
                    <td className="py-2 max-w-[240px]"><div className="truncate">{packages.find((p) => p.id === e.pkgId)?.name ?? '—'}</div><div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{e.key ? MILESTONES.find((m) => m.key === e.key)?.name ?? String(e.key).replace('_', ' ') : ''}{e.round > 1 ? ` · round ${e.round}` : ''}</div></td>
                    <td className="py-2 whitespace-nowrap"><span className="text-[12px] font-semibold" style={{ color: c }}>{label}</span>{e.decision !== 'IGNORED' && e.decision !== 'DUPLICATE' && e.decision !== 'ERROR' && <span className="ml-2 inline-flex items-center gap-1"><Meter value={e.confidence} tone={confTone(e.confidence)} w={36} /></span>}</td>
                    <td className="py-2 pr-4 text-[12px] max-w-[320px]" style={{ color: 'var(--muted)' }}><span className="line-clamp-2">{e.ignoredReason ?? e.resolution ?? (e.reason ? e.reason.replace(/_/g, ' ').toLowerCase() : e.ai?.rationale ?? e.ruleHits[0])}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <Dialog open={!!view} onClose={() => setView(null)} title="Source document">{view && docs.find((x) => x.id === view.docId) && <SourceViewer doc={docs.find((x) => x.id === view.docId)!} event={view} />}</Dialog>
    </div>
  );
}
