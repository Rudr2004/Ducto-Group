import { Fragment, useMemo, useState } from 'react';
import { Download, Search, X, ShieldCheck, FileClock, UserCog, Upload, Layers } from 'lucide-react';
import { useStore } from '@/store/store';
import { useFilter, useViews, emptyFilter } from '@/lib/hooks';
import { MILESTONES, PACKAGE_STATUSES, STAGES, type Stage, type Owner } from '@/domain/milestones';
import type { CellView, PackageView } from '@/domain/types';
import { fmt } from '@/domain/dates';
import { Empty, HealthChip, PageHeader, PkgStatus, Provenance, STATUS, Segmented, cx } from '@/components/ui';
import { exportSchedule } from '@/lib/excelExport';
import { go } from '@/lib/hooks';

type Mode = 'pva' | 'variance' | 'cycle';
const STAGE_COLOR: Record<Stage, string> = { A: '#6B7FD7', B: '#3B82C4', C: '#8B6FCB', D: '#0E9F8E' };
const avatarColor = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360; return `linear-gradient(135deg, hsl(${h} 62% 52%), hsl(${(h + 40) % 360} 62% 42%))`; };
const PRESETS: Record<string, Stage[]> = { all: ['A', 'B', 'C', 'D'], ab: ['A', 'B'], cd: ['C', 'D'] };

export default function Schedule() {
  const views = useViews();
  const { f, set, clear } = useFilter();
  const { asOf, events, docs, openPkg, packages } = useStore();
  const [mode, setMode] = useState<Mode>('pva');
  const [dense, setDense] = useState(false);
  const [group, setGroup] = useState<'none' | 'category' | 'manager' | 'status'>('none');
  const [preset, setPreset] = useState<keyof typeof PRESETS>('all');
  const [pop, setPop] = useState<{ v: PackageView; c: CellView; x: number; y: number } | null>(null);

  const cols = MILESTONES.filter((m) => PRESETS[preset].includes(m.stage));
  const managers = [...new Set(packages.map((p) => p.manager))].sort();
  const cats = [...new Set(packages.map((p) => p.category))].filter(Boolean).sort();

  const rows = useMemo(() => views.filter((v) => {
    if (f.q && !`${v.pkg.name} ${v.pkg.ref} ${v.pkg.slNo} ${v.pkg.manager}`.toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.status && v.status !== f.status) return false;
    if (f.health && v.health !== f.health) return false;
    if (f.manager && v.pkg.manager !== f.manager) return false;
    if (f.category && v.pkg.category !== f.category) return false;
    if (f.demoOnly && !v.pkg.isDemo) return false;
    if (f.owner && !(v.daysLost[f.owner as Owner] > 0)) return false;
    if (f.cellStatus && !v.cells.some((c) => c.status === f.cellStatus && (!f.milestone || c.key === f.milestone))) return false;
    return true;
  }), [views, f]);

  const groups = useMemo(() => {
    if (group === 'none') return [{ key: '', rows }];
    const k = (v: PackageView) => (group === 'category' ? v.pkg.category : group === 'manager' ? v.pkg.manager : v.status);
    const keys = group === 'status' ? PACKAGE_STATUSES.filter((s) => rows.some((r) => r.status === s)) : [...new Set(rows.map(k))].sort();
    return keys.map((key) => ({ key, rows: rows.filter((r) => k(r) === key) }));
  }, [rows, group]);

  const active = Object.entries(f).filter(([k, v]) => v && v !== emptyFilter[k as keyof typeof emptyFilter]);
  const rowH = dense ? 40 : 52;
  const narrow = typeof window !== 'undefined' && window.innerWidth < 768;
  const left = narrow ? [36, 150, 150] : [48, 248, 172]; // Sl, Package, Status (Status sticky only on wide screens)

  if (!packages.length) return <Empty title="Import a schedule to begin" body="Drop the Dutco project tracker (.xlsm or .xlsx) on the Ingest page. Headers are found by their text, so other project files work too." action={<button className="btn btn-primary" onClick={() => go('ingest')}><Upload size={15} />Go to Ingest</button>} />;

  return (
    <div>
      <PageHeader title="Procurement schedule" desc="The familiar tracker — planned above actual — but every actual date now carries its source."
        actions={<button className="btn" onClick={() => exportSchedule(rows, events, docs, asOf)}><Download size={15} />Export to Dutco Excel</button>} />

      <div className="card p-3 mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 input min-w-[220px] flex-1 max-w-[320px]"><Search size={15} style={{ color: 'var(--faint)' }} /><input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search package, ref, Sl.No" className="bg-transparent outline-none flex-1" aria-label="Search packages" /></label>
        <select className="input" value={f.status ?? ''} onChange={(e) => set({ status: (e.target.value || null) as never })} aria-label="Status"><option value="">Any status</option>{PACKAGE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.health ?? ''} onChange={(e) => set({ health: (e.target.value || null) as never })} aria-label="Health"><option value="">Any health</option>{['On Track', 'At Risk', 'Delayed', 'Excluded'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.manager ?? ''} onChange={(e) => set({ manager: e.target.value || null })} aria-label="Manager"><option value="">Any manager</option>{managers.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input hidden md:block" value={f.category ?? ''} onChange={(e) => set({ category: e.target.value || null })} aria-label="Category"><option value="">Any category</option>{cats.map((s) => <option key={s}>{s}</option>)}</select>
        <label className="inline-flex items-center gap-1.5 text-[13px] px-1"><input type="checkbox" checked={f.demoOnly} onChange={(e) => set({ demoOnly: e.target.checked })} />POC packages only</label>
        {active.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clear}><X size={14} />Clear filters</button>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented label="Cell view" value={mode} onChange={setMode} options={[{ value: 'pva', label: 'Planned vs actual' }, { value: 'variance', label: 'Variance (days)' }, { value: 'cycle', label: 'Cycle vs SLA' }]} />
        <Segmented label="Columns" value={preset} onChange={setPreset} options={[{ value: 'all', label: 'All 15' }, { value: 'ab', label: 'Strategy + tender' }, { value: 'cd', label: 'Review + award' }]} />
        <select className="input" value={group} onChange={(e) => setGroup(e.target.value as never)} aria-label="Group rows by"><option value="none">No grouping</option><option value="category">Group: category</option><option value="manager">Group: manager</option><option value="status">Group: status</option></select>
        <Segmented label="Density" value={dense ? 'c' : 'r'} onChange={(v) => setDense(v === 'c')} options={[{ value: 'r', label: 'Comfortable' }, { value: 'c', label: 'Compact' }]} />
        <span className="ml-auto text-[12.5px] num" style={{ color: 'var(--muted)' }}>{rows.length} of {views.length} packages</span>
      </div>

      <Legend />

      {rows.length === 0 ? <div className="card"><Empty title="No packages match these filters" body="Clear a filter or search for a different package name or reference." action={<button className="btn" onClick={clear}>Clear filters</button>} /></div> : (
        <div className="card sched-wrap overflow-auto relative" style={{ maxHeight: 'calc(100vh - 290px)', minHeight: 360 }}>
          <table className="sched border-separate border-spacing-0 text-[12.5px] min-w-max">
            <thead className="sticky top-0 z-20">
              <tr>
                <th colSpan={3} className="sched-h sched-corner sticky left-0 z-30 text-left" style={{ minWidth: left[0] + left[1] + left[2] }}>
                  <span className="inline-flex items-center gap-1.5"><Layers size={13} />Package</span>
                </th>
                {(['A', 'B', 'C', 'D'] as Stage[]).filter((s) => PRESETS[preset].includes(s)).map((s) => {
                  const n = MILESTONES.filter((m) => m.stage === s).length;
                  return <th key={s} colSpan={n} className="sched-h sched-stage text-left" style={{ ['--sc' as string]: STAGE_COLOR[s] }}>
                    <span className="stage-badge">{s}</span>{STAGES[s]}
                  </th>;
                })}
              </tr>
              <tr className="text-left">
                {['Sl', 'Work package · ref · manager', 'Status · health'].map((h, i) => <th key={h} className="sched-h sched-col sticky z-30" style={{ left: left.slice(0, i).reduce((a, b) => a + b, 0), minWidth: left[i], maxWidth: left[i], width: left[i], boxShadow: i === 2 ? '1px 0 0 var(--line), 8px 0 12px -10px rgba(15,42,74,.25)' : undefined }}>{h}</th>)}
                {cols.map((m, i) => <th key={m.key} className={cx('sched-h sched-col w-[84px] min-w-[84px]', (i === 0 || cols[i - 1].stage !== m.stage) && 'stage-start')} title={`${m.code} · ${m.name} · SLA to next step from master list`} style={{ ['--sc' as string]: STAGE_COLOR[m.stage] }}>
                  <div className="col-code num">{m.code}</div><div className="leading-tight font-medium" style={{ color: 'var(--ink)' }}>{m.short}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.key || 'all'}>
                  {g.key && <tr><td colSpan={3 + cols.length} className="sched-group sticky left-0">{g.key} <span className="font-normal num" style={{ color: 'var(--muted)' }}>· {g.rows.length}</span></td></tr>}
                  {g.rows.map((v, ri) => (
                    <tr key={v.pkg.id} className={cx('sched-row group cursor-pointer', v.pkg.excluded && 'opacity-55')} style={{ height: rowH, animationDelay: `${Math.min(ri * 22, 520)}ms` }} onClick={() => openPkg(v.pkg.id)}>
                      <td className="sc sticky left-0 z-10 px-3 num" style={{ minWidth: left[0], width: left[0] }}><span className="sl-badge">{v.pkg.slNo}</span></td>
                      <td className="sc sticky z-10 px-3" style={{ left: left[0], minWidth: left[1], maxWidth: left[1], width: left[1] }}>
                        <div className="flex items-center gap-2.5">
                          <span className="avatar" style={{ background: avatarColor(v.pkg.manager) }} title={v.pkg.manager}>{v.pkg.manager.slice(0, 1)}</span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold pkg-name" title={v.pkg.name}>{v.pkg.name}</div>
                            {!dense && <div className="text-[11px] truncate num" style={{ color: 'var(--faint)' }} title={`${v.pkg.category} · sheet name “${v.pkg.managerRaw}”`}><span className="ref-chip">{v.pkg.ref}</span> {v.pkg.manager}{v.pkg.isDemo ? ' · POC' : ''}{v.pkg.excluded ? ' · excluded' : ''}</div>}
                          </div>
                        </div>
                      </td>
                      <td className={cx('sc px-3', !narrow && 'sticky z-10')} style={{ left: left[0] + left[1], minWidth: left[2], maxWidth: left[2], width: left[2], boxShadow: '1px 0 0 var(--line), 8px 0 12px -10px rgba(15,42,74,.25)' }}>
                        <PkgStatus s={v.status} muted={v.pkg.excluded} />
                        {!dense && <div className="mt-0.5 scale-90 origin-left"><HealthChip h={v.health} /></div>}
                      </td>
                      {cols.map((m, i) => {
                        const c = v.cells.find((x) => x.key === m.key)!;
                        return <Cell key={m.key} c={c} mode={mode} dense={dense} stageStart={i === 0 || cols[i - 1].stage !== m.stage}
                          onOpen={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPop({ v, c, x: r.left, y: r.bottom }); }} />;
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pop && <CellPopover {...pop} onClose={() => setPop(null)} />}
    </div>
  );
}

function Cell({ c, mode, dense, stageStart, onOpen }: { c: CellView; mode: Mode; dense: boolean; stageStart: boolean; onOpen: (e: React.MouseEvent) => void }) {
  const s = STATUS[c.status];
  const done = c.status === 'DONE_ON_TIME' || c.status === 'DONE_LATE' || (c.status === 'NO_PLAN' && c.actual);
  const legacy = c.provenance === 'LEGACY';
  let main: React.ReactNode = fmt(c.actual, true);
  if (mode === 'variance') main = c.variance === null ? (c.status === 'OVERDUE' ? 'open' : '—') : `${c.variance > 0 ? '+' : ''}${c.variance}d`;
  if (mode === 'cycle') main = c.cycle === null ? '—' : `${c.cycle}/${c.sla}d`;
  const tip = `${s.label}${c.planned ? ` · plan ${fmt(c.planned)}` : ''}${c.actual ? ` · actual ${fmt(c.actual)}` : ''}${c.variance ? ` · ${c.variance > 0 ? '+' : ''}${c.variance}d` : ''} · SLA ${c.sla}d${c.provenance ? ` · ${c.provenance === 'LEGACY' ? 'legacy manual' : c.provenance === 'SYSTEM' ? 'system-captured' : 'admin-corrected'}` : ''}${c.hiddenFuture ? ' · evidence dated after the as-of date' : ''}`;
  return (
    <td className={cx('sched-cell', stageStart && 'stage-start')}>
      <button onClick={onOpen} title={tip} aria-label={tip}
        className={cx('cell-btn relative w-full h-full flex flex-col justify-center pl-3 pr-2 text-left', legacy && 'hatch', c.status === 'NOT_APPLICABLE' && 'is-na', (c.status === 'UPCOMING' || c.status === 'NO_PLAN') && 'is-quiet')}
        style={{ minHeight: dense ? 32 : 44, ['--fg' as string]: s.fg, background: c.status === 'UPCOMING' || c.status === 'NO_PLAN' || c.status === 'NOT_APPLICABLE' ? undefined : s.bg }}>
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: c.status === 'UPCOMING' ? 'transparent' : s.fg, opacity: c.status === 'NO_PLAN' || c.status === 'NOT_APPLICABLE' ? 0 : 1 }} />
        {!dense && mode === 'pva' && <span className="text-[10.5px] num leading-tight" style={{ color: 'var(--faint)' }}>{c.planned ? fmt(c.planned, true) : 'no plan'}</span>}
        <span className="flex items-center gap-1 num font-semibold text-[12.5px] leading-tight" style={{ color: done ? 'var(--ink)' : s.fg }}>
          {c.actual || mode !== 'pva' ? main : c.status === 'NOT_APPLICABLE' ? 'N/A' : c.status === 'OVERDUE' ? <><s.Icon size={11} />overdue</> : c.status === 'SKIPPED_MISSING' ? <><s.Icon size={11} />missing</> : c.status === 'DUE_SOON' ? 'due soon' : <span style={{ color: 'var(--faint)', fontWeight: 400 }}>—</span>}
          {c.actual && c.provenance === 'SYSTEM' && <ShieldCheck size={11} style={{ color: 'var(--teal)' }} aria-hidden />}
          {c.actual && c.provenance === 'ADMIN' && <UserCog size={11} style={{ color: '#8B6FCB' }} aria-hidden />}
          {c.actual && c.provenance === 'LEGACY' && <FileClock size={11} style={{ color: 'var(--faint)' }} aria-hidden />}
        </span>
      </button>
    </td>
  );
}

function CellPopover({ v, c, x, y, onClose }: { v: PackageView; c: CellView; x: number; y: number; onClose: () => void }) {
  const { events, docs, openPkg } = useStore();
  const m = MILESTONES.find((k) => k.key === c.key)!;
  const ev = c.record?.evidenceId ? events.find((e) => e.id === c.record!.evidenceId) : undefined;
  const doc = ev ? docs.find((d) => d.id === ev.docId) : undefined;
  const left = Math.min(x, window.innerWidth - 340);
  const top = Math.min(y + 6, window.innerHeight - 280);
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute card w-[320px] p-4 anim-rise" style={{ left, top, boxShadow: 'var(--shadow)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${m.name} details`}>
        <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{m.code} · {v.pkg.name}</div>
        <div className="font-semibold mb-2">{m.name}</div>
        <div className="grid grid-cols-2 gap-y-1.5 text-[12.5px] num">
          <span style={{ color: 'var(--muted)' }}>Planned</span><span>{fmt(c.planned)}</span>
          <span style={{ color: 'var(--muted)' }}>Actual</span><span className="font-semibold">{fmt(c.actual)}</span>
          <span style={{ color: 'var(--muted)' }}>Status</span><span style={{ color: STATUS[c.status].fg }}>{STATUS[c.status].label}{c.variance ? ` (${c.variance > 0 ? '+' : ''}${c.variance}d)` : ''}</span>
          <span style={{ color: 'var(--muted)' }}>SLA to next</span><span>{c.sla} days{c.cycle !== null ? ` · took ${c.cycle}` : ''}</span>
          <span style={{ color: 'var(--muted)' }}>Source</span><span>{c.provenance ? <Provenance p={c.provenance} conf={c.record?.confidence} small /> : '—'}</span>
        </div>
        {doc && <div className="mt-3 p-2.5 rounded-lg text-[12px]" style={{ background: 'var(--sunken)' }}><div className="font-medium truncate" dir="auto">{doc.subject || doc.fileName}</div><div style={{ color: 'var(--muted)' }} className="truncate">{doc.kind === 'email' ? doc.from.email : doc.kind.toUpperCase() + ' event'}</div></div>}
        {c.provenance === 'LEGACY' && <p className="mt-3 text-[12px]" style={{ color: 'var(--muted)' }}>Typed by hand in the original tracker. It is shown for continuity but is not treated as verified evidence.</p>}
        {c.hiddenFuture && <p className="mt-3 text-[12px]" style={{ color: 'var(--soon)' }}>Evidence exists but is dated after the as-of date, so this view treats it as “not yet”.</p>}
        <button className="btn btn-sm mt-3 w-full justify-center" onClick={() => { openPkg(v.pkg.id); onClose(); }}>Open package timeline</button>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3 text-[12px]">
      {(['DONE_ON_TIME', 'DONE_LATE', 'DUE_SOON', 'OVERDUE', 'UPCOMING', 'SKIPPED_MISSING', 'NOT_APPLICABLE'] as const).map((k) => { const s = STATUS[k]; return <span key={k} className="legend-pill" style={{ color: s.fg }}><s.Icon size={12} />{s.label}</span>; })}
      <span className="legend-pill"><ShieldCheck size={12} style={{ color: 'var(--teal)' }} />System-captured</span>
      <span className="legend-pill"><span className="h-3 w-4 rounded-sm hatch" style={{ border: '1px solid var(--line-strong)' }} /><FileClock size={12} />Legacy (manual)</span>
      <span className="legend-pill"><UserCog size={12} style={{ color: '#8B6FCB' }} />Admin-corrected</span>
    </div>
  );
}
