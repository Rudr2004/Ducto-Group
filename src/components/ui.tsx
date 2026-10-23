import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CircleDashed, Clock, Info, Minus, ShieldCheck, Sparkles, UserCog, X, XCircle, FileClock } from 'lucide-react';
import type { Health, MilestoneStatus, Provenance } from '@/domain/types';
import type { PackageStatus } from '@/domain/milestones';
import { useStore } from '@/store/store';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Counts the first number in `text` up from zero (e.g. "87%" → 0…87%); other characters are kept as-is. */
export function CountUp({ text, ms = 1100 }: { text: string; ms?: number }) {
  const m = /-?\d+(\.\d+)?/.exec(text);
  const target = m ? parseFloat(m[0]) : 0;
  const dec = m?.[1] ? m[1].length - 1 : 0;
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!m || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const f = (t: number) => { const p = Math.min((t - t0) / ms, 1); setV(target * (1 - Math.pow(1 - p, 4))); if (p < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <>{text}</>;
  return <>{text.slice(0, m.index)}{v.toFixed(dec)}{text.slice(m.index + m[0].length)}</>;
}

export const STATUS: Record<MilestoneStatus, { label: string; fg: string; bg: string; Icon: typeof Check }> = {
  DONE_ON_TIME: { label: 'Done on time', fg: 'var(--ok)', bg: 'var(--ok-bg)', Icon: Check },
  DONE_LATE: { label: 'Done late', fg: 'var(--late)', bg: 'var(--late-bg)', Icon: Clock },
  DUE_SOON: { label: 'Due soon', fg: 'var(--soon)', bg: 'var(--soon-bg)', Icon: Clock },
  OVERDUE: { label: 'Overdue', fg: 'var(--over)', bg: 'var(--over-bg)', Icon: AlertTriangle },
  UPCOMING: { label: 'Upcoming', fg: 'var(--up)', bg: 'var(--up-bg)', Icon: CircleDashed },
  NOT_APPLICABLE: { label: 'Not applicable', fg: 'var(--faint)', bg: 'transparent', Icon: Minus },
  NO_PLAN: { label: 'No plan', fg: 'var(--faint)', bg: 'var(--sunken)', Icon: Minus },
  SKIPPED_MISSING: { label: 'Missing (data gap)', fg: 'var(--over)', bg: 'transparent', Icon: XCircle },
};

export function StatusChip({ status, extra, compact }: { status: MilestoneStatus; extra?: string; compact?: boolean }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium num"
      style={{ color: s.fg, background: s.bg, border: status === 'NOT_APPLICABLE' ? '1px dashed var(--line-strong)' : '1px solid transparent' }}>
      <s.Icon size={12} strokeWidth={2.5} aria-hidden />{!compact && s.label}{extra && <span className="opacity-80">{extra}</span>}
    </span>
  );
}

const PKG_COLOR: Record<PackageStatus, string> = {
  'Awaiting DTP': 'var(--faint)', 'DTP Received': '#6B7FD7', 'Out To Tender': '#3B82C4', 'Commercial Review': '#0E9F8E',
  'PTC Stage': '#8B6FCB', 'Final Negotiations': '#C2691E', 'OBT Ongoing': '#B45AA0', Awarded: 'var(--ok)',
};
export const pkgStatusColor = (s: PackageStatus) => PKG_COLOR[s];
export function PkgStatus({ s, muted }: { s: PackageStatus; muted?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap', muted && 'opacity-50')}>
      <span className="h-2 w-2 rounded-full" style={{ background: PKG_COLOR[s] }} aria-hidden />{s}
    </span>
  );
}

const HEALTH: Record<Health, { fg: string; bg: string; Icon: typeof Check }> = {
  'On Track': { fg: 'var(--ok)', bg: 'var(--ok-bg)', Icon: Check },
  'At Risk': { fg: 'var(--soon)', bg: 'var(--soon-bg)', Icon: Clock },
  Delayed: { fg: 'var(--over)', bg: 'var(--over-bg)', Icon: AlertTriangle },
  Excluded: { fg: 'var(--faint)', bg: 'var(--sunken)', Icon: Minus },
};
export function HealthChip({ h }: { h: Health }) {
  const s = HEALTH[h];
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap" style={{ color: s.fg, background: s.bg }}><s.Icon size={12} strokeWidth={2.5} aria-hidden />{h}</span>;
}

export function Provenance({ p, conf, small }: { p: Provenance | null; conf?: number; small?: boolean }) {
  if (!p) return null;
  const meta = {
    SYSTEM: { label: 'System', Icon: ShieldCheck, fg: 'var(--teal)', title: 'Captured automatically from source evidence' },
    LEGACY: { label: 'Legacy (manual)', Icon: FileClock, fg: 'var(--muted)', title: 'Typed by hand in the old Excel tracker — not verified evidence' },
    ADMIN: { label: 'Admin-corrected', Icon: UserCog, fg: '#8B6FCB', title: 'Corrected by the administrator with reason and evidence' },
  }[p];
  return (
    <span title={meta.title} className={cx('inline-flex items-center gap-1 font-medium whitespace-nowrap', small ? 'text-[11px]' : 'text-[12px]')} style={{ color: meta.fg }}>
      <meta.Icon size={small ? 11 : 13} aria-hidden />{meta.label}{conf !== undefined && p === 'SYSTEM' && <span className="num opacity-75">· {(conf * 100).toFixed(0)}%</span>}
    </span>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{title}</h1>
        <p className="text-[13.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{desc}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="h-11 w-11 rounded-full grid place-items-center mb-3" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>{icon ?? <Sparkles size={20} />}</div>
      <div className="font-semibold">{title}</div>
      <p className="text-[13px] max-w-sm mt-1" style={{ color: 'var(--muted)' }}>{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Section({ title, desc, right, children, className, pad = true, fill }: { title?: ReactNode; desc?: string; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean; fill?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {title && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div><h2 className="text-[14px] font-semibold">{title}</h2>{desc && <p className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{desc}</p>}</div>
          {right}
        </header>
      )}
      <div className={cx(pad && 'px-4 pb-4', fill && 'flex-1 flex flex-col min-h-0')}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-lg" style={{ background: 'var(--sunken)', border: '1px solid var(--line)' }}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className="px-2.5 h-7 rounded-md text-[12px] font-medium transition-colors"
          style={value === o.value ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: 'var(--muted)' }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Drawer({ open, onClose, children, width = 720, label }: { open: boolean; onClose: () => void; children: ReactNode; width?: number; label: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0" style={{ background: 'rgba(8,19,31,.42)' }} onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full anim-in overflow-y-auto" style={{ maxWidth: width, background: 'var(--bg)', boxShadow: 'var(--shadow)', borderLeft: '1px solid var(--line)' }}>
        {children}
      </div>
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0" style={{ background: 'rgba(8,19,31,.5)' }} onClick={onClose} />
      <div ref={ref} className="relative card w-full max-w-lg anim-rise" style={{ boxShadow: 'var(--shadow)' }}>
        <header className="flex items-center justify-between px-5 pt-4 pb-2"><h2 className="font-semibold text-[15px]">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div className="px-5 pb-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--line)' }}>{footer}</footer>}
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const drop = useStore((s) => s.dropToast);
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]" aria-live="polite">
      {toasts.map((t) => {
        const c = { ok: 'var(--ok)', warn: 'var(--soon)', error: 'var(--over)', info: 'var(--teal)' }[t.tone];
        const Icon = { ok: Check, warn: AlertTriangle, error: XCircle, info: Info }[t.tone];
        return (
          <div key={t.id} className="card anim-rise flex gap-3 p-3" style={{ boxShadow: 'var(--shadow)' }}>
            <Icon size={18} style={{ color: c, flex: 'none', marginTop: 1 }} />
            <div className="min-w-0 flex-1"><div className="font-semibold text-[13px]">{t.title}</div>{t.body && <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{t.body}</div>}</div>
            <button onClick={() => drop(t.id)} aria-label="Dismiss" style={{ color: 'var(--faint)' }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

export function Meter({ value, tone = 'var(--teal)', w = 64 }: { value: number; tone?: string; w?: number }) {
  return <span className="inline-block h-1.5 rounded-full overflow-hidden align-middle" style={{ width: w, background: 'var(--sunken)' }} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, value * 100)}%`, background: tone }} /></span>;
}

export const confTone = (c: number) => (c >= 0.9 ? 'var(--ok)' : c >= 0.6 ? 'var(--soon)' : 'var(--over)');
