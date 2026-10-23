import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MILESTONES, PACKAGE_STATUSES, STAGES, OWNERS, type PackageStatus, type Owner, type Stage } from '@/domain/milestones';
import type { PackageView, MilestoneStatus } from '@/domain/types';
import { STATUS, pkgStatusColor, cx, CountUp } from './ui';
import { fmt } from '@/domain/dates';

export const OWNER_COLOR: Record<Owner, string> = { 'Project team': '#6B7FD7', Procurement: '#0E9F8E', Suppliers: '#D08A2E', Approvers: '#B45AA0' };

/** Signature element: the procurement pipeline drawn as a line of stations, packages sitting at their current station. */
export function PipelineRail({ views, onPick }: { views: PackageView[]; onPick: (s: PackageStatus) => void }) {
  const live = views.filter((v) => !v.pkg.excluded);
  const counts = PACKAGE_STATUSES.map((s) => live.filter((v) => v.status === s));
  const max = Math.max(...counts.map((c) => c.length), 1);
  return (
    <div className="relative overflow-x-auto">
      <div className="min-w-[760px] grid grid-cols-8 relative pt-2 pb-1">
        <div className="rail-flow absolute left-[6.25%] right-[6.25%] top-[52px] h-[3px] rounded-full" aria-hidden />
        {PACKAGE_STATUSES.map((s, i) => {
          const list = counts[i];
          const size = 12 + Math.round((list.length / max) * 20);
          const delayed = list.filter((v) => v.health === 'Delayed').length;
          const risk = list.filter((v) => v.health === 'At Risk').length;
          return (
            <button key={s} onClick={() => onPick(s)} className="group relative flex flex-col items-center text-center px-1 rounded-lg focus-visible:outline-2"
              aria-label={`${s}: ${list.length} packages, ${delayed} delayed. Open in schedule`}>
              <div className="text-[28px] font-semibold num leading-none mb-1.5 transition-transform group-hover:-translate-y-0.5" style={{ color: list.length ? 'var(--ink)' : 'var(--faint)' }}><CountUp text={String(list.length)} /></div>
              <div className="h-[36px] grid place-items-center relative z-10">
                <span className="pop-in rounded-full grid place-items-center transition-transform group-hover:scale-125" style={{ width: size, height: size, background: pkgStatusColor(s), boxShadow: `0 0 0 4px var(--surface), 0 6px 14px -4px ${pkgStatusColor(s)}`, animationDelay: `${0.3 + i * 0.08}s` }} />
              </div>
              <div className="text-[12.5px] font-medium mt-2 leading-tight">{s}</div>
              <div className="flex gap-2 mt-1 text-[11px] num" style={{ color: 'var(--muted)' }}>
                {delayed > 0 && <span style={{ color: 'var(--over)' }}>{delayed} delayed</span>}
                {risk > 0 && <span style={{ color: 'var(--soon)' }}>{risk} at risk</span>}
                {!delayed && !risk && <span>{i === 7 ? 'complete' : '—'}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HBars({ rows, format = (v) => `${Math.round(v * 100)}%`, max = 1, onPick, tone }: { rows: { label: string; value: number; sub?: string }[]; format?: (v: number) => string; max?: number; onPick?: (label: string) => void; tone?: (v: number) => string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <button key={r.label} onClick={() => onPick?.(r.label)} className="grid grid-cols-[minmax(90px,140px)_1fr_88px] items-center gap-3 text-left rounded-md px-1 py-0.5 hover:bg-[var(--sunken)]" aria-label={`${r.label} ${format(r.value)}`}>
          <span className="text-[12.5px] truncate" title={r.label}>{r.label}</span>
          <span className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--sunken)' }}>
            <span className="grow-x block h-full rounded-full" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: tone ? tone(r.value) : 'var(--teal)' }} />
          </span>
          <span className="text-[12.5px] num font-medium text-right whitespace-nowrap">{format(r.value)}{r.sub && <span className="block text-[10.5px] font-normal" style={{ color: 'var(--faint)' }}>{r.sub}</span>}</span>
        </button>
      ))}
    </div>
  );
}

export function OwnerStack({ rows, onPick }: { rows: { label: string; parts: Record<Owner, number> }[]; onPick?: (label: string, owner: Owner) => void }) {
  const max = Math.max(1, ...rows.map((r) => OWNERS.reduce((t, o) => t + r.parts[o], 0)));
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">{OWNERS.map((o) => <span key={o} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--muted)' }}><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OWNER_COLOR[o] }} />{o}</span>)}</div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const total = OWNERS.reduce((t, o) => t + r.parts[o], 0);
          return (
            <div key={r.label} className="grid grid-cols-[minmax(90px,140px)_1fr_48px] items-center gap-3">
              <span className="text-[12.5px] truncate" title={r.label}>{r.label}</span>
              <span className="flex h-3.5 rounded overflow-hidden" style={{ background: 'var(--sunken)' }}>
                {OWNERS.map((o) => r.parts[o] > 0 && (
                  <button key={o} title={`${o}: ${r.parts[o]} days`} aria-label={`${r.label}, ${o}: ${r.parts[o]} days lost`} onClick={() => onPick?.(r.label, o)}
                    className="grow-x h-full hover:brightness-110" style={{ width: `${(r.parts[o] / max) * 100}%`, background: OWNER_COLOR[o] }} />
                ))}
              </span>
              <span className="text-[12.5px] num text-right font-medium">{total}d</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HEAT: Partial<Record<MilestoneStatus, string>> = {
  DONE_ON_TIME: 'var(--ok)', DONE_LATE: 'var(--late)', DUE_SOON: 'var(--soon)', OVERDUE: 'var(--over)', UPCOMING: 'var(--up-bg)',
  NOT_APPLICABLE: 'transparent', NO_PLAN: 'var(--sunken)', SKIPPED_MISSING: 'transparent',
};
const STAGE_TINT: Record<Stage, string> = { A: '#6B7FD7', B: '#3B82C4', C: '#8B6FCB', D: '#0E9F8E' };
export function Heatmap({ views, onPick }: { views: PackageView[]; onPick: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const [rowHover, setRowHover] = useState<string | null>(null);
  const groups = (['A', 'B', 'C', 'D'] as Stage[]).map((s) => ({ s, items: MILESTONES.filter((m) => m.stage === s) }));
  const COLS = 'minmax(170px,240px) minmax(0,1fr) 58px';
  const band = (child: (g: (typeof groups)[number]) => ReactNode) => (
    <div className="flex gap-[10px] min-w-0">
      {groups.map((g) => <div key={g.s} className="min-w-0" style={{ flex: `${g.items.length + (g.items.length < 3 ? 0.9 : 0)} 1 0`, display: 'grid', gridTemplateColumns: `repeat(${g.items.length}, minmax(0,1fr))`, gap: 3 }}>{child(g)}</div>)}
    </div>
  );
  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[760px]">
        <div className="grid items-end gap-3 mb-1" style={{ gridTemplateColumns: COLS }}>
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Package</span>
          {band((g) => (
            <span key={g.s} className="heat-stage" style={{ gridColumn: `span ${g.items.length}`, ['--sc' as string]: STAGE_TINT[g.s] }}><b>{g.s}</b>{STAGES[g.s]}</span>
          ))}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--faint)' }}>Done</span>
        </div>
        <div className="grid items-end gap-3 mb-1.5" style={{ gridTemplateColumns: COLS }}>
          <span />
          {band((g) => g.items.map((m) => <span key={m.key} className="heat-code num" title={`${m.code} · ${m.name}`}>{m.code}</span>))}
          <span />
        </div>
        <div className="flex flex-col gap-[3px]">
          {views.map((v, ri) => (
            <div key={v.pkg.id} className={cx('heat-row grid items-center gap-3 rounded-lg', rowHover === v.pkg.id && 'is-hot')} style={{ gridTemplateColumns: COLS }}
              onMouseEnter={() => setRowHover(v.pkg.id)} onMouseLeave={() => setRowHover(null)}>
              <button onClick={() => onPick(v.pkg.id)} className="heat-label text-left text-[12.5px] truncate pl-2 pr-2 font-medium" title={v.pkg.name}>{v.pkg.name}</button>
              {band((g) => g.items.map((m) => {
                const ci = m.idx, c = v.cells[ci];
                const k = `${v.pkg.id}${c.key}`;
                const legacy = c.provenance === 'LEGACY';
                const tone = HEAT[c.status];
                return (
                  <button key={c.key} onClick={() => onPick(v.pkg.id)} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}
                    className={cx('cell-in heat-cell relative', legacy && 'hatch')}
                    style={{ animationDelay: `${Math.min(900, ri * 25 + ci * 18)}ms`, background: tone && tone !== 'transparent' ? `linear-gradient(180deg, color-mix(in srgb, ${tone} 82%, #fff), ${tone})` : tone, border: c.status === 'SKIPPED_MISSING' ? '1.5px solid var(--over)' : c.status === 'NOT_APPLICABLE' ? '1px dashed var(--line-strong)' : '1px solid transparent', opacity: v.pkg.excluded ? 0.35 : 1 }}
                    aria-label={`${v.pkg.name} — ${m.name}: ${STATUS[c.status].label}`}>
                    {c.status === 'SKIPPED_MISSING' && <span className="absolute inset-0 grid place-items-center text-[10px] font-bold leading-none" style={{ color: 'var(--over)' }}>!</span>}
                    {hover === k && (
                      <span className="heat-tip card" style={{ left: ci > 10 ? 'auto' : '50%', right: ci > 10 ? 0 : 'auto', transform: ci > 10 ? 'none' : 'translateX(-50%)' }}>
                        <span className="flex items-center gap-1.5 font-semibold"><i className="h-2 w-2 rounded-full" style={{ background: STATUS[c.status].fg }} />{m.name}</span>
                        <span style={{ color: 'var(--muted)' }}>{STATUS[c.status].label}</span>
                        <span className="num">Plan {fmt(c.planned, true)} · Actual {fmt(c.actual, true)}</span>
                      </span>
                    )}
                  </button>
                );
              }))}
              <span className="num text-[11.5px] text-right pr-1.5" style={{ color: 'var(--muted)' }}><b style={{ color: 'var(--ink)' }}>{v.actualCount}</b>/{v.cells.length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ values, w = 72, h = 24, tone = 'var(--over)' }: { values: number[]; w?: number; h?: number; tone?: string }) {
  const id = useId();
  if (values.length < 2) return <span style={{ width: w, display: 'inline-block' }} />;
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  const px = (i: number) => 2 + (i / (values.length - 1)) * (w - 6);
  const py = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 7);
  const pts = values.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  return (
    <svg width={w} height={h} aria-hidden className="overflow-visible">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={tone} stopOpacity=".28" /><stop offset="1" stopColor={tone} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`${px(0)},${h} ${pts} ${px(values.length - 1)},${h}`} fill={`url(#${id})`} className="fade-in-slow" />
      <polyline points={pts} pathLength={1} className="draw-line" fill="none" stroke={tone} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(values.length - 1)} cy={py(values[values.length - 1])} r={2.6} fill={tone} stroke="var(--surface)" strokeWidth={1.2} className="pop-in" style={{ animationDelay: '1.4s' }} />
    </svg>
  );
}

export function TrendLine({ points, h: hProp = 230, target = 0.8, fill }: { points: { label: string; value: number | null }[]; h?: number; target?: number; fill?: boolean }) {
  const id = useId();
  const [hi, setHi] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 560, h: hProp });
  // fill mode: measure the container and draw at its pixel size, so the chart grows with the card instead of leaving a gap
  useEffect(() => {
    if (!fill || !box.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.max(200, Math.round(height)) });
    });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [fill]);
  const w = fill ? size.w : 560, h = fill ? size.h : hProp;
  const padL = 38, padR = 20, padT = 26, padB = 28;
  const n = points.length;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - v) * (h - padT - padB);
  const have = points.map((p, i) => (p.value === null ? null : i)).filter((i): i is number => i !== null);
  const line = have.map((i) => `${x(i)},${y(points[i].value!)}`).join(' ');
  const last = have.at(-1);
  const focus = hi ?? last ?? null;
  const fp = focus !== null ? points[focus] : null;
  return (
    <div ref={box} className={fill ? 'relative flex-1 min-h-[220px]' : undefined}>
    <svg viewBox={`0 0 ${w} ${h}`} width={fill ? w : undefined} height={fill ? h : undefined} className={cx('overflow-visible', fill ? 'absolute inset-0' : 'w-full')} role="img" aria-label={`Weekly SLA compliance trend: ${points.map((p) => `${p.label} ${p.value === null ? 'n/a' : Math.round(p.value * 100) + '%'}`).join(', ')}`} onMouseLeave={() => setHi(null)}>
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--teal)" stopOpacity=".32" /><stop offset="1" stopColor="var(--teal)" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6B7FD7" /><stop offset="1" stopColor="var(--teal)" /></linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => <g key={g}><line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeDasharray={g === 0 ? '' : '3 5'} /><text x={padL - 8} y={y(g) + 4} fontSize={10} textAnchor="end" fill="var(--faint)">{Math.round(g * 100)}%</text></g>)}
      <line x1={padL} x2={w - padR} y1={y(target)} y2={y(target)} stroke="var(--soon)" strokeWidth={1.2} strokeDasharray="6 4" opacity={.8} />
      <text x={w - padR} y={y(target) - 5} fontSize={10} fontWeight={600} textAnchor="end" fill="var(--soon)">Target {Math.round(target * 100)}%</text>
      {have.length > 1 && <polygon points={`${x(have[0])},${y(0)} ${line} ${x(have.at(-1)!)},${y(0)}`} fill={`url(#${id}a)`} className="fade-in-slow" />}
      <polyline points={line} pathLength={1} className="draw-line" fill="none" stroke={`url(#${id}l)`} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {focus !== null && fp?.value != null && <line x1={x(focus)} x2={x(focus)} y1={padT - 6} y2={y(0)} stroke="var(--teal)" strokeOpacity=".35" strokeDasharray="3 3" />}
      {have.map((i) => (
        <circle key={i} cx={x(i)} cy={y(points[i].value!)} r={i === focus ? 6 : 3.5} fill={i === focus ? 'var(--teal)' : 'var(--surface)'} stroke="var(--teal)" strokeWidth={2} className="pop-in" style={{ animationDelay: `${0.5 + i * 0.1}s`, transition: 'r .15s' }} />
      ))}
      {last !== undefined && <circle cx={x(last)} cy={y(points[last].value!)} r={6} fill="none" stroke="var(--teal)" className="pulse-ring" />}
      {points.map((p, i) => (i % 2 === n % 2 || i === n - 1) && <text key={`t${i}`} x={x(i)} y={h - 6} fontSize={10} textAnchor="middle" fill={i === focus ? 'var(--ink)' : 'var(--faint)'} fontWeight={i === focus ? 600 : 400}>{p.label}</text>)}
      {focus !== null && fp?.value != null && (() => {
        const tx = Math.min(Math.max(x(focus), padL + 34), w - padR - 34), ty = y(fp.value) - 14;
        return <g pointerEvents="none"><rect x={tx - 32} y={ty - 22} width={64} height={22} rx={7} fill="var(--navy)" /><text x={tx} y={ty - 7} fontSize={12} fontWeight={700} textAnchor="middle" fill="#fff">{Math.round(fp.value * 100)}%</text></g>;
      })()}
      {have.map((i) => <rect key={`h${i}`} x={x(i) - (w - padL - padR) / Math.max(1, n - 1) / 2} y={0} width={(w - padL - padR) / Math.max(1, n - 1)} height={h} fill="transparent" onMouseEnter={() => setHi(i)} />)}
    </svg>
    </div>
  );
}
