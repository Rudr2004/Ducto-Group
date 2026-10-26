import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Printer, FileSpreadsheet, Sparkles } from 'lucide-react';
import { useStore } from '@/store/store';
import { useViews, drill } from '@/lib/hooks';
import { computePackage, compliance } from '@/domain/engine';
import { addDays, fmt } from '@/domain/dates';
import { MILESTONES, OWNERS, type Owner } from '@/domain/milestones';
import { PageHeader, Section, HealthChip, PkgStatus, Segmented, CountUp, cx } from '@/components/ui';
import { HBars, Heatmap, OwnerStack, PipelineRail, Sparkline, TrendLine } from '@/components/charts';
import { exportDashboardData } from '@/lib/excelExport';
import { go } from '@/lib/hooks';

export default function Dashboard() {
  const all = useViews();
  const { asOf, packages, records, rebaselines, settings, events, openPkg, role } = useStore();
  const isAdmin = role === 'admin';
  const [mgr, setMgr] = useState('');
  const [cat, setCat] = useState('');
  const [by, setBy] = useState<'manager' | 'milestone' | 'stage'>('manager');
  const [heatScope, setHeatScope] = useState<'demo' | 'all'>('demo');
  const views = all.filter((v) => (!mgr || v.pkg.manager === mgr) && (!cat || v.pkg.category === cat));
  const live = views.filter((v) => !v.pkg.excluded);
  const managers = [...new Set(packages.map((p) => p.manager))].sort();
  const cats = [...new Set(packages.map((p) => p.category))].filter(Boolean).sort();

  const comp = compliance(live);
  const trend = useMemo(() => {
    const byPkg = new Map<string, typeof records>();
    records.forEach((r) => byPkg.set(r.pkgId, [...(byPkg.get(r.pkgId) ?? []), r]));
    return Array.from({ length: 9 }, (_, k) => {
      const d = addDays(asOf, -7 * (8 - k));
      const vs = packages.filter((p) => !p.excluded && (!mgr || p.manager === mgr) && (!cat || p.category === cat)).map((p) => computePackage(p, byPkg.get(p.id) ?? [], rebaselines, settings, d));
      const c = compliance(vs);
      return { label: fmt(d, true), value: c.done ? c.pct : null };
    });
  }, [records, packages, rebaselines, settings, asOf, mgr, cat]);
  const fourWeeksAgo = trend[4]?.value ?? null;
  const delta = fourWeeksAgo !== null ? comp.pct - fourWeeksAgo : null;
  const trendVals = trend.map((t) => t.value).filter((v): v is number => v !== null);

  const overdue = live.filter((v) => v.cells.find((c) => !c.actual && c.status !== 'NOT_APPLICABLE' && c.status !== 'SKIPPED_MISSING')?.status === 'OVERDUE').length;
  const lateSteps = live.flatMap((v) => v.cells.filter((c) => c.cycle !== null && c.overSla > 0));
  const avgLate = lateSteps.length ? lateSteps.reduce((t, c) => t + c.overSla, 0) / lateSteps.length : 0;
  const slipping = live.filter((v) => (v.slippage ?? 0) > settings.slipAlertDays && v.status !== 'Awarded').length;
  const openExc = events.filter((e) => e.decision === 'QUEUED').length;
  const totalActuals = live.reduce((t, v) => t + v.actualCount, 0);
  const sysActuals = live.reduce((t, v) => t + v.cells.filter((c) => c.provenance === 'SYSTEM' || c.provenance === 'ADMIN').length, 0);
  const awarded = live.filter((v) => v.status === 'Awarded').length;

  const ownerRows = useMemo(() => {
    const groups = new Map<string, Record<Owner, number>>();
    for (const v of live) {
      const k = v.pkg.manager;
      const g = groups.get(k) ?? (Object.fromEntries(OWNERS.map((o) => [o, 0])) as Record<Owner, number>);
      OWNERS.forEach((o) => { g[o] += v.daysLost[o]; });
      groups.set(k, g);
    }
    const total = Object.fromEntries(OWNERS.map((o) => [o, [...groups.values()].reduce((t, g) => t + g[o], 0)])) as Record<Owner, number>;
    return [{ label: 'All packages', parts: total }, ...[...groups].map(([label, parts]) => ({ label, parts })).sort((a, b) => OWNERS.reduce((t, o) => t + b.parts[o], 0) - OWNERS.reduce((t, o) => t + a.parts[o], 0))];
  }, [live]);

  const compRows = useMemo(() => {
    if (by === 'manager') return managers.map((m) => { const c = compliance(live.filter((v) => v.pkg.manager === m)); return { label: m, value: c.pct, sub: `${c.ok}/${c.done} steps` }; }).filter((r) => r.sub !== '0/0 steps');
    if (by === 'stage') return (['A', 'B', 'C', 'D'] as const).map((s) => { const c = compliance(live, (_v, cell) => MILESTONES.find((m) => m.key === cell.key)!.stage === s); return { label: `Stage ${s}`, value: c.pct, sub: `${c.ok}/${c.done} steps` }; }).filter((r) => r.sub !== '0/0 steps');
    return MILESTONES.slice(1).map((m) => { const c = compliance(live, (_v, cell) => cell.key === m.key); return { label: m.name, value: c.pct, sub: `${c.ok}/${c.done}` }; }).filter((r) => r.sub !== '0/0');
  }, [by, live, managers]);

  const delayed = [...live].filter((v) => v.status !== 'Awarded' || OWNERS.some((o) => v.daysLost[o] > 0))
    .map((v) => ({ v, lost: OWNERS.reduce((t, o) => t + v.daysLost[o], 0), spark: v.cells.filter((c) => c.cycle !== null).reduce<number[]>((acc, c) => [...acc, (acc.at(-1) ?? 0) + c.overSla], [0]) }))
    .sort((a, b) => b.lost - a.lost).slice(0, 10);

  const maxLost = Math.max(1, ...delayed.map((d) => d.lost));
  const heatViews =(heatScope === 'demo' ? views.filter((v) => v.pkg.isDemo) : views).slice().sort((a, b) => Number(a.pkg.excluded) - Number(b.pkg.excluded));

  const kpis = [
    { label: 'SLA compliance', value: `${Math.round(comp.pct * 100)}%`, sub: `${comp.ok} of ${comp.done} steps within SLA`, delta, onClick: () => drill({ cellStatus: 'DONE_LATE' }) },
    { label: 'Awarded', value: `${awarded}`, suffix: ` / ${live.length}`, sub: `${live.length - awarded} still in procurement`, onClick: () => drill({ status: 'Awarded' }) },
    { label: 'Overdue milestones', value: `${overdue}`, sub: 'next open step past its plan', tone: overdue ? 'var(--over)' : undefined, onClick: () => drill({ cellStatus: 'OVERDUE' }) },
    { label: 'Avg days late per step', value: avgLate.toFixed(1), sub: `${lateSteps.length} steps over SLA`, onClick: () => drill({ cellStatus: 'DONE_LATE' }) },
    { label: 'Awards slipping', value: `${slipping}`, sub: `forecast > ${settings.slipAlertDays}d past target`, tone: slipping ? 'var(--late)' : undefined, onClick: () => drill({ health: 'Delayed' }) },
    { label: 'Open exceptions', value: `${openExc}`, sub: 'admin queue only', onClick: isAdmin ? () => go('exceptions') : undefined },
    { label: 'System-captured', value: `${totalActuals ? Math.round((sysActuals / totalActuals) * 100) : 0}%`, sub: `${sysActuals} of ${totalActuals} actual dates`, tone: 'var(--teal)', onClick: () => drill({ demoOnly: true }) },
  ];

  return (
    <div>
      <PageHeader title="Procurement overview" desc={`Where every package stands as of ${fmt(asOf)} — and who the delays belong to.`}
        actions={<>
          <select className="input" value={mgr} onChange={(e) => setMgr(e.target.value)} aria-label="Filter by package manager"><option value="">All managers</option>{managers.map((m) => <option key={m}>{m}</option>)}</select>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{cats.map((m) => <option key={m}>{m}</option>)}</select>
          <button className="btn" onClick={() => exportDashboardData(views, asOf)}><FileSpreadsheet size={15} />Data (.xlsx)</button>
          <button className="btn" onClick={() => window.print()}><Printer size={15} />PDF snapshot</button>
        </>} />

      {sysActuals === 0 && isAdmin && (
        <button onClick={() => go('ingest')} className="w-full card flex items-center gap-3 p-3.5 mb-4 text-left hover:border-[var(--teal)] transition-colors" style={{ background: 'var(--teal-soft)', borderColor: 'transparent' }}>
          <Sparkles size={18} style={{ color: 'var(--teal)' }} />
          <span className="flex-1 text-[13.5px]"><b>Every date on this page was typed by hand.</b> Process the demo mailbox to watch the Control Tower capture them from email, SharePoint, DocuSign and OBT evidence instead.</span>
          <span className="btn btn-teal btn-sm">Open Ingest</span>
        </button>
      )}

      <Section title="Pipeline" desc="Packages at their current stage (by process order, not by latest date). Select a stage to open the schedule." className="mb-4">
        <PipelineRail views={views} onPick={(s) => drill({ status: s })} />
      </Section>

      <div className="card grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 mb-4 overflow-hidden">
        {kpis.map((k, i) => (
          <button key={k.label} onClick={k.onClick} disabled={!k.onClick} className={cx('kpi text-left p-4', i > 0 && 'xl:border-l', !k.onClick && 'cursor-default')} style={{ borderColor: 'var(--line)', borderTop: '1px solid var(--line)', marginTop: -1 }}>
            <div className="label">{k.label}</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-[30px] font-semibold num leading-none tracking-[-0.02em]" style={{ color: k.tone }}><CountUp text={k.value} /></span>
              {'suffix' in k && <span className="text-[14px] num" style={{ color: 'var(--faint)' }}>{k.suffix}</span>}
              {'delta' in k && k.delta !== null && k.delta !== undefined && (
                <span className="inline-flex items-center text-[12px] font-medium num" style={{ color: k.delta >= 0 ? 'var(--ok)' : 'var(--over)' }} title="Change vs 4 weeks earlier">
                  {k.delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(Math.round(k.delta * 100))} pts
                </span>
              )}
            </div>
            <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--muted)' }}>{k.sub}</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4 mb-4">
        <Section title="Days lost by delay owner" desc="Excess days over SLA on each step, attributed to who the step was waiting on.">
          <OwnerStack rows={ownerRows} onPick={(label, owner) => drill({ manager: label === 'All packages' ? null : label, owner })} />
        </Section>
        <Section title="SLA compliance" desc="Steps completed within SLA ÷ steps completed." right={<Segmented label="Group compliance by" value={by} onChange={setBy} options={[{ value: 'manager', label: 'Manager' }, { value: 'stage', label: 'Stage' }, { value: 'milestone', label: 'Milestone' }]} />}>
          <div className={cx(by === 'milestone' && 'max-h-[300px] overflow-y-auto pr-1')}>
            <HBars rows={compRows} tone={(v) => (v >= 0.8 ? 'var(--ok)' : v >= 0.5 ? 'var(--soon)' : 'var(--over)')}
              onPick={(l) => (by === 'manager' ? drill({ manager: l }) : by === 'milestone' ? drill({ milestone: MILESTONES.find((m) => m.name === l)?.key ?? null, cellStatus: 'DONE_LATE' }) : drill({}))} />
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.25fr] gap-4 mb-4">
        <Section title="Weekly SLA compliance" desc="Recomputed as at each week-ending date — the same rules, no hindsight." className="flex flex-col" fill>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[40px] leading-none font-semibold num tracking-[-0.03em]" style={{ color: 'var(--teal)' }}><CountUp text={`${Math.round(comp.pct * 100)}%`} /></span>
                {delta !== null && (
                  <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold num" style={{ color: delta >= 0 ? 'var(--ok)' : 'var(--over)', background: delta >= 0 ? 'var(--ok-bg)' : 'var(--over-bg)' }}>
                    {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(Math.round(delta * 100))} pts
                  </span>
                )}
              </div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>this week · vs 4 weeks earlier</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[['Best week', trendVals.length ? Math.max(...trendVals) : null], ['Lowest', trendVals.length ? Math.min(...trendVals) : null], ['9-wk avg', trendVals.length ? trendVals.reduce((a, b) => a + b, 0) / trendVals.length : null]].map(([l, v]) => (
                <div key={l as string} className="rounded-xl px-3 py-1.5 text-center" style={{ background: 'var(--sunken)' }}>
                  <div className="text-[10.5px] uppercase tracking-wider" style={{ color: 'var(--faint)' }}>{l as string}</div>
                  <div className="text-[15px] font-semibold num">{v === null ? '—' : `${Math.round((v as number) * 100)}%`}</div>
                </div>
              ))}
            </div>
          </div>
          <TrendLine points={trend} fill />
        </Section>
        <Section title="Most delayed packages" desc="Cumulative days over SLA; the line shows where the time was lost." pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="dl-head text-left"><th className="px-4 py-2 w-[44%]">Package</th><th className="py-2">Stage</th><th className="py-2">Health</th><th className="py-2 text-right pr-4">Days lost</th></tr></thead>
              <tbody>
                {delayed.map(({ v, lost, spark }, i) => (
                  <tr key={v.pkg.id} className="dl-row cursor-pointer" style={{ animationDelay: `${i * 50}ms` }} onClick={() => { go('schedule'); openPkg(v.pkg.id); }}>
                    <td className="px-4 py-2.5 max-w-[240px]">
                      <div className="flex items-center gap-3">
                        <span className={cx('dl-rank', i < 3 && 'top')}>{i + 1}</span>
                        <div className="min-w-0"><div className="truncate font-semibold dl-name" title={v.pkg.name}>{v.pkg.name}</div><div className="text-[11.5px] truncate" style={{ color: 'var(--faint)' }}><span className="ref-chip">{v.pkg.ref}</span> {v.pkg.manager}</div></div>
                      </div>
                    </td>
                    <td className="py-2.5"><PkgStatus s={v.status} /></td>
                    <td className="py-2.5"><HealthChip h={v.health} /></td>
                    <td className="py-2.5 pr-4 w-[190px]">
                      <div className="flex items-center justify-end gap-3"><Sparkline values={spark} /><span className="num font-bold w-11 text-right">{lost}d</span></div>
                      <div className="lost-bar mt-1.5"><i style={{ width: `${Math.max(4, (lost / maxLost) * 100)}%` }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section title="Milestone heatmap" desc="Each square is one milestone. Hatched = legacy manual date; outlined red = missing although later steps are done."
        right={<Segmented label="Heatmap scope" value={heatScope} onChange={setHeatScope} options={[{ value: 'demo', label: 'POC packages' }, { value: 'all', label: `All ${views.length}` }]} />}>
        <HeatLegend />
        <Heatmap views={heatViews} onPick={(id) => { go('schedule'); openPkg(id); }} />
      </Section>
    </div>
  );
}

export function HeatLegend() {
  const items: [string, string, string?][] = [['Done on time', 'var(--ok)'], ['Done late', 'var(--late)'], ['Due soon', 'var(--soon)'], ['Overdue', 'var(--over)'], ['Upcoming', 'var(--up-bg)'], ['No plan', 'var(--sunken)']];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[12px]" style={{ color: 'var(--muted)' }}>
      {items.map(([l, c]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: c, border: '1px solid var(--line)' }} />{l}</span>)}
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] hatch" style={{ border: '1px solid var(--line-strong)' }} />Legacy (manual)</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ border: '1px solid var(--over)' }} />Missing</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ border: '1px dashed var(--line-strong)' }} />Not applicable</span>
    </div>
  );
}
