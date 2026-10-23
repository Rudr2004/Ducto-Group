import { Fragment, useMemo, useState } from 'react';
import { ShieldCheck, ShieldX, Search, Bomb } from 'lucide-react';
import { useStore, verify } from '@/store/store';
import { MILESTONES } from '@/domain/milestones';
import { PageHeader, Segmented } from '@/components/ui';

export default function Audit() {
  const { audit, tamper, role, packages } = useStore();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'dates' | 'denied' | 'admin'>('all');
  const [result, setResult] = useState<ReturnType<typeof verify> | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const label = (entity: string) => { const [p, k] = entity.split(':'); const pk = packages.find((x) => x.id === p); return pk ? `${pk.name}${k ? ' · ' + (MILESTONES.find((m) => m.key === k)?.name ?? k) : ''}` : entity; };
  const rows = useMemo(() => audit.filter((a) => (kind === 'all' || (kind === 'dates' && a.action.startsWith('ACTUAL')) || (kind === 'denied' && a.action.startsWith('DENIED')) || (kind === 'admin' && a.role === 'admin'))
    && (!q || `${a.action} ${label(a.entity)} ${a.actor} ${a.reason ?? ''}`.toLowerCase().includes(q.toLowerCase()))).slice().reverse(), [audit, kind, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader title="Audit log" desc="Append-only. Each row stores the hash of the row before it, so any edit breaks the chain."
        actions={<>
          {role === 'admin' && <button className="btn" onClick={() => { tamper(); setResult(null); }} title="Demo: edit a row directly, bypassing the application"><Bomb size={15} />Simulate tampering</button>}
          <button className="btn btn-primary" onClick={() => setResult(verify(audit))}><ShieldCheck size={15} />Verify chain</button>
        </>} />
      {result && (
        <div role="status" className="card p-4 mb-4 flex items-center gap-3 anim-rise" style={{ borderColor: result.ok ? 'var(--ok)' : 'var(--over)', background: result.ok ? 'var(--ok-bg)' : 'var(--over-bg)' }}>
          {result.ok ? <ShieldCheck size={22} style={{ color: 'var(--ok)' }} /> : <ShieldX size={22} style={{ color: 'var(--over)' }} />}
          <div className="text-[13.5px]">{result.ok ? <><b>Chain intact.</b> All {audit.length} rows verified from the genesis hash.</> : <><b>Chain broken at row #{result.seq}.</b> {result.why}. Rows after it can no longer be trusted until investigated.</>}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented label="Entries" value={kind} onChange={setKind} options={[{ value: 'all', label: `All ${audit.length}` }, { value: 'dates', label: 'Date changes' }, { value: 'admin', label: 'Admin actions' }, { value: 'denied', label: `Denied ${audit.filter((a) => a.action.startsWith('DENIED')).length}` }]} />
        <label className="flex items-center gap-2 input ml-auto w-full sm:w-72"><Search size={15} style={{ color: 'var(--faint)' }} /><input className="bg-transparent outline-none flex-1" placeholder="Search action, package, actor" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" /></label>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[12px]" style={{ color: 'var(--muted)' }}><th className="font-medium px-4 py-2">#</th><th className="font-medium py-2">When</th><th className="font-medium py-2">Actor</th><th className="font-medium py-2">Action</th><th className="font-medium py-2">Entity</th><th className="font-medium py-2 pr-4">Hash</th></tr></thead>
          <tbody>
            {rows.slice(0, 400).map((a) => (
              <Fragment key={a.seq}>
                <tr className="cursor-pointer hover:bg-[var(--sunken)]" style={{ borderTop: '1px solid var(--line)', background: result && !result.ok && result.seq === a.seq ? 'var(--over-bg)' : undefined }} onClick={() => setOpen(open === a.seq ? null : a.seq)} aria-expanded={open === a.seq}>
                  <td className="px-4 py-2 num" style={{ color: 'var(--faint)' }}>{a.seq}</td>
                  <td className="py-2 num whitespace-nowrap">{new Date(a.at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                  <td className="py-2 whitespace-nowrap">{a.actor}</td>
                  <td className="py-2"><span className="text-[12px] font-semibold" style={{ color: a.action.startsWith('DENIED') ? 'var(--over)' : a.role === 'admin' ? '#8B6FCB' : 'var(--ink)' }}>{a.action.replace(/_/g, ' ').toLowerCase()}</span></td>
                  <td className="py-2 max-w-[300px] truncate">{label(a.entity)}</td>
                  <td className="py-2 pr-4 num text-[11.5px]" style={{ color: 'var(--faint)' }}>{a.hash.slice(0, 10)}…</td>
                </tr>
                {open === a.seq && (
                  <tr><td colSpan={6} className="px-4 pb-3">
                    <div className="grid md:grid-cols-2 gap-3 text-[12px]">
                      <div><div className="label mb-1">Before</div><pre className="p-2.5 rounded-lg overflow-x-auto" style={{ background: 'var(--over-bg)' }}>{JSON.stringify(a.before, null, 2)}</pre></div>
                      <div><div className="label mb-1">After</div><pre className="p-2.5 rounded-lg overflow-x-auto" style={{ background: 'var(--ok-bg)' }}>{JSON.stringify(a.after, null, 2)}</pre></div>
                    </div>
                    {(a.reason || a.evidence) && <p className="text-[12px] mt-2">{a.reason && <><b>Reason:</b> {a.reason} </>}{a.evidence && <><b>Evidence:</b> {a.evidence}</>}</p>}
                    <p className="text-[11px] mt-1 num break-all" style={{ color: 'var(--faint)' }}>prev {a.prevHash}<br />hash {a.hash}</p>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
