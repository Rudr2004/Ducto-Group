import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Table2, Inbox, Bell, FileSearch, ShieldAlert, Target, ScrollText, Settings, UploadCloud,
  Search, Menu, CalendarDays, Bot, X, ChevronsLeft, ChevronsRight, Play, UserRound,
} from 'lucide-react';
import { useStore, PEOPLE, REPORTING_WEEK, TODAY } from '@/store/store';
import { useAlerts, useRoute, type Route } from '@/lib/hooks';
import type { Role } from '@/lib/audit';
import { cx } from './ui';
import { fmt } from '@/domain/dates';

const NAV: { r: Route; label: string; Icon: typeof Inbox; admin?: boolean }[] = [
  { r: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { r: 'schedule', label: 'Schedule', Icon: Table2 },
  { r: 'exceptions', label: 'Exceptions', Icon: Inbox },
  { r: 'alerts', label: 'Alerts', Icon: Bell },
  { r: 'evidence', label: 'Evidence', Icon: FileSearch },
  { r: 'quality', label: 'Data quality', Icon: ShieldAlert },
  { r: 'accuracy', label: 'Accuracy', Icon: Target },
  { r: 'audit', label: 'Audit log', Icon: ScrollText },
  { r: 'settings', label: 'Settings', Icon: Settings },
  { r: 'ingest', label: 'Ingest', Icon: UploadCloud, admin: true },
];

function Mark() {
  // abstract control-tower mark: a mast with a beacon (original drawing, no Dutco logo)
  return (
    <svg width="28" height="28" viewBox="0 0 26 26" aria-hidden className="brand-mark flex-none">
      <defs><linearGradient id="mk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#17B8A6" /><stop offset="1" stopColor="#0E7C9F" /></linearGradient></defs>
      <rect width="26" height="26" rx="7" fill="url(#mk)" />
      <path d="M13 6.5v13M9.5 19.5h7M10.5 10.5h5l-1 3h-3z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="13" cy="6.5" r="1.8" fill="#fff" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [route, go] = useRoute();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const events = useStore((s) => s.events);
  const snoozed = useStore((s) => s.snoozed);
  const role = useStore((s) => s.role);
  const settings = useStore((s) => s.settings);
  const alerts = useAlerts();
  const exc = events.filter((e) => e.decision === 'QUEUED' && !snoozed.includes(e.id)).length;
  const acks = useStore((s) => s.alertAcks);
  const unread = alerts.filter((a) => !acks.includes(a.key)).length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
      {NAV.filter((n) => !n.admin || role === 'admin').map((n) => {
        const active = route === n.r;
        const badge = n.r === 'exceptions' ? exc : n.r === 'alerts' ? unread : 0;
        return (
          <a key={n.r} href={`#${n.r}`} onClick={(e) => { e.preventDefault(); go(n.r); setMobile(false); }} aria-current={active ? 'page' : undefined}
            title={collapsed ? n.label : undefined}
            className={cx('nav-item flex items-center gap-3 h-10 rounded-xl px-3 text-[13.5px] font-medium', active && 'is-active', collapsed && 'justify-center px-0')}>
            <n.Icon size={17} aria-hidden style={active ? { color: '#5EE0CF' } : undefined} />
            {!collapsed && <span className="flex-1">{n.label}</span>}
            {!collapsed && badge > 0 && <span className="num text-[11px] font-semibold rounded-full px-1.5 min-w-[20px] text-center" style={{ background: n.r === 'exceptions' ? '#0E9F8E' : 'rgba(255,255,255,.16)', color: '#fff' }}>{badge}</span>}
          </a>
        );
      })}
    </nav>
  );

  const sidebar = (
    <aside className={cx('sidebar flex flex-col h-full py-3 transition-[width] duration-300', collapsed ? 'w-[64px]' : 'w-[232px]')} style={{ background: 'linear-gradient(180deg,#0F2A4A 0%,#0B2039 100%)' }}>
      <div className={cx('flex items-center gap-2.5 px-4 mb-5 mt-1', collapsed && 'justify-center px-0')}>
        <Mark />
        {!collapsed && <div className="leading-tight"><div className="text-white font-semibold text-[14px]">Procurement Control Tower</div><div className="text-[11.5px]" style={{ color: 'rgba(226,236,248,.6)' }}>Dutco Group</div></div>}
      </div>
      {nav}
      <div className="mt-auto px-3">
        {!collapsed && (
          <div className="rounded-lg p-3 mb-2 text-[11.5px] leading-snug" style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(226,236,248,.7)' }}>
            <div className="flex items-center gap-1.5 font-medium text-white mb-1"><Bot size={13} />{settings.aiOutage ? 'AI offline (degraded)' : 'AI: simulated classifier'}</div>
            Stage 1 POC · synthetic mailbox · Dutco sample workbook
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center gap-2 h-8 w-full rounded-md px-2 text-[12px]" style={{ color: 'rgba(226,236,248,.6)' }} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight size={16} className="mx-auto" /> : <><ChevronsLeft size={16} />Collapse</>}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full">
      <div className="hidden lg:block h-full flex-none">{sidebar}</div>
      {mobile && <div className="lg:hidden fixed inset-0 z-50 flex"><div className="anim-in h-full">{sidebar}</div><button className="flex-1" style={{ background: 'rgba(8,19,31,.5)' }} onClick={() => setMobile(false)} aria-label="Close menu" /></div>}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <TopBar onMenu={() => setMobile(true)} onSearch={() => setPalette(true)} unread={unread} />
        {settings.aiOutage && (
          <div role="status" className="px-6 py-2 text-[13px] flex items-center gap-2" style={{ background: 'var(--soon-bg)', color: 'var(--soon)', borderBottom: '1px solid var(--line)' }}>
            <Bot size={15} /><b>AI is offline.</b><span style={{ color: 'var(--ink)' }}>System events still commit; emails that need AI confirmation go to the Exception Queue as AI_UNAVAILABLE. Nothing is auto-committed without both checks.</span>
          </div>
        )}
        <main id="main" className="flex-1 overflow-y-auto">
          <div className="max-w-[1480px] mx-auto px-4 sm:px-6 py-6">{children}</div>
        </main>
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}

function TopBar({ onMenu, onSearch, unread }: { onMenu: () => void; onSearch: () => void; unread: number }) {
  const { asOf, setAsOf, role, setRole } = useStore();
  const [, go] = useRoute();
  return (
    <header className="topbar flex items-center gap-2 sm:gap-3 h-14 px-3 sm:px-6 flex-none">
      <button className="lg:hidden btn btn-ghost btn-sm" onClick={onMenu} aria-label="Open menu"><Menu size={18} /></button>
      <div className="hidden md:flex flex-col leading-tight min-w-0">
        <span className="text-[13px] font-semibold truncate">Sample Project</span>
        <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>DCC · name withheld</span>
      </div>
      <div className="hidden md:block w-px h-7" style={{ background: 'var(--line)' }} />
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1.5 h-[34px] rounded-lg px-2" style={{ border: '1px solid var(--line)' }} title="All views are computed as at this date">
          <CalendarDays size={15} style={{ color: 'var(--teal)' }} aria-hidden />
          <span className="hidden sm:inline text-[12px]" style={{ color: 'var(--muted)' }}>As of</span>
          <input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} aria-label="As-of date" className="bg-transparent text-[13px] font-medium num w-[118px] outline-none" />
        </label>
        <button className={cx('btn btn-sm hidden xl:inline-flex', asOf === REPORTING_WEEK && 'btn-primary')} onClick={() => setAsOf(REPORTING_WEEK)} title={`Reporting week ending ${fmt(REPORTING_WEEK)}`}>Reporting week</button>
        <button className={cx('btn btn-sm hidden xl:inline-flex', asOf === TODAY && 'btn-primary')} onClick={() => setAsOf(TODAY)}>Today</button>
      </div>
      <button onClick={onSearch} className="ml-auto md:ml-2 flex items-center gap-2 h-[34px] rounded-lg px-2.5 text-[13px] md:min-w-[220px]" style={{ border: '1px solid var(--line)', color: 'var(--muted)', background: 'var(--sunken)' }} aria-label="Search packages and actions">
        <Search size={15} /><span className="hidden md:inline flex-1 text-left">Jump to package…</span><span className="hidden md:inline kbd">⌘K</span>
      </button>
      <div className="md:ml-auto flex items-center gap-1.5">
        <label className="hidden sm:flex items-center gap-1.5 h-[34px] rounded-lg pl-2 pr-1" style={{ border: '1px solid var(--line)' }} title="POC role switcher (Stage 2: Entra ID SSO)">
          <UserRound size={15} style={{ color: 'var(--muted)' }} aria-hidden />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role" className="bg-transparent text-[13px] font-medium outline-none pr-1">
            <option value="admin">Admin · Jassim</option><option value="manager">Package Manager · Mani</option><option value="leadership">Leadership</option>
          </select>
        </label>
        <button className="btn btn-ghost btn-sm relative" onClick={() => go('alerts')} aria-label={`Alerts, ${unread} unread`}>
          <Bell size={17} />{unread > 0 && <span className="absolute -top-0.5 -right-0.5 num text-[10px] font-bold rounded-full min-w-[17px] h-[17px] grid place-items-center px-1 text-white" style={{ background: 'var(--over)' }}>{unread > 99 ? '99+' : unread}</span>}
        </button>
      </div>
    </header>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const packages = useStore((s) => s.packages);
  const openPkg = useStore((s) => s.openPkg);
  const setRole = useStore((s) => s.setRole);
  const processAll = useStore((s) => s.processAll);
  const [, go] = useRoute();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const items = useMemo(() => {
    const acts: { label: string; hint: string; run: () => void }[] = [
      { label: 'Process mailbox (run ingestion)', hint: 'Action', run: () => { go('ingest'); processAll().catch(() => {}); } },
      { label: 'Open exception queue', hint: 'Go to', run: () => go('exceptions') },
      { label: 'Switch role: Admin', hint: 'Role', run: () => setRole('admin') },
      { label: 'Switch role: Package Manager', hint: 'Role', run: () => setRole('manager') },
      { label: 'Switch role: Leadership', hint: 'Role', run: () => setRole('leadership') },
      ...(['dashboard', 'schedule', 'alerts', 'evidence', 'quality', 'accuracy', 'audit', 'settings'] as Route[]).map((r) => ({ label: `Go to ${r}`, hint: 'Go to', run: () => go(r) })),
    ];
    const pk = packages.map((p) => ({ label: p.name, hint: `${p.ref} · Sl ${p.slNo}`, run: () => { go('schedule'); openPkg(p.id); } }));
    const all = [...pk, ...acts];
    const t = q.toLowerCase().trim();
    return (t ? all.filter((x) => x.label.toLowerCase().includes(t) || x.hint.toLowerCase().includes(t)) : [...acts.slice(0, 5), ...pk.slice(0, 6)]).slice(0, 10);
  }, [q, packages, go, openPkg, setRole, processAll]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0" style={{ background: 'rgba(8,19,31,.45)' }} onClick={onClose} />
      <div className="relative card w-full max-w-xl overflow-hidden anim-rise" style={{ boxShadow: 'var(--shadow)' }}>
        <div className="flex items-center gap-2 px-4 h-12" style={{ borderBottom: '1px solid var(--line)' }}>
          <Search size={16} style={{ color: 'var(--muted)' }} />
          <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Search packages, refs or actions…" className="flex-1 bg-transparent outline-none text-[14px]"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
              if (e.key === 'Enter' && items[i]) { items[i].run(); onClose(); }
              if (e.key === 'Escape') onClose();
            }} aria-label="Search" />
          <button onClick={onClose} aria-label="Close"><X size={16} style={{ color: 'var(--faint)' }} /></button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1.5" role="listbox">
          {items.map((it, k) => (
            <li key={it.label + k} role="option" aria-selected={k === i}>
              <button onMouseEnter={() => setI(k)} onClick={() => { it.run(); onClose(); }} className="w-full flex items-center gap-3 px-4 h-10 text-left text-[13.5px]" style={k === i ? { background: 'var(--sunken)' } : undefined}>
                {it.hint === 'Action' ? <Play size={14} style={{ color: 'var(--teal)' }} /> : <span className="w-3.5" />}
                <span className="flex-1 truncate">{it.label}</span><span className="text-[12px]" style={{ color: 'var(--faint)' }}>{it.hint}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--muted)' }}>No package or action matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}

export { PEOPLE };
