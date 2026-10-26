import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { computePackage } from '@/domain/engine';
import { diffDays, type ISODate } from '@/domain/dates';
import { M, type MilestoneKey, type PackageStatus } from '@/domain/milestones';
import type { Health, PackageView } from '@/domain/types';
import { useStore } from '@/store/store';
import type { Role } from '@/lib/audit';

export function useViews(): PackageView[] {
  const packages = useStore((s) => s.packages);
  const records = useStore((s) => s.records);
  const rebaselines = useStore((s) => s.rebaselines);
  const settings = useStore((s) => s.settings);
  const asOf = useStore((s) => s.asOf);
  return useMemo(() => {
    const byPkg = new Map<string, typeof records>();
    records.forEach((r) => byPkg.set(r.pkgId, [...(byPkg.get(r.pkgId) ?? []), r]));
    return packages.map((p) => computePackage(p, byPkg.get(p.id) ?? [], rebaselines, settings, asOf));
  }, [packages, records, rebaselines, settings, asOf]);
}

export const ROUTES = ['dashboard', 'schedule', 'exceptions', 'alerts', 'evidence', 'quality', 'accuracy', 'audit', 'settings', 'ingest'] as const;
export type Route = (typeof ROUTES)[number];
/** Screens only the administrator may open. Hidden from the sidebar and palette, and refused when reached by URL. */
export const ADMIN_ONLY_ROUTES: readonly Route[] = ['exceptions', 'ingest', 'settings'];
export const canOpen = (role: Role, route: Route) => role === 'admin' || !ADMIN_ONLY_ROUTES.includes(route);
const read = (): Route => { const h = window.location.hash.replace('#', '') as Route; return ROUTES.includes(h) ? h : 'dashboard'; };
export function useRoute(): [Route, (r: Route) => void] {
  const [r, setR] = useState<Route>(read);
  useEffect(() => { const f = () => setR(read()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return [r, (to: Route) => { if (to !== read()) window.location.hash = to; setR(to); document.getElementById('main')?.scrollTo({ top: 0 }); }];
}
export const go = (r: Route) => { window.location.hash = r; };

export interface ScheduleFilter {
  q: string; status: PackageStatus | null; health: Health | null; manager: string | null; category: string | null;
  milestone: MilestoneKey | null; cellStatus: string | null; demoOnly: boolean; owner: string | null;
}
export const emptyFilter: ScheduleFilter = { q: '', status: null, health: null, manager: null, category: null, milestone: null, cellStatus: null, demoOnly: false, owner: null };
export const useFilter = create<{ f: ScheduleFilter; set: (p: Partial<ScheduleFilter>) => void; clear: () => void }>((set) => ({
  f: emptyFilter, set: (p) => set((s) => ({ f: { ...s.f, ...p } })), clear: () => set({ f: emptyFilter }),
}));
/** Drill-down: any dashboard element opens a filtered Schedule. */
export const drill = (p: Partial<ScheduleFilter>) => { useFilter.getState().set({ ...emptyFilter, ...p }); go('schedule'); };

export type AlertType = 'DUE_SOON' | 'OVERDUE' | 'ESCALATION' | 'FORECAST_SLIP' | 'NEW_EXCEPTION' | 'DOCUSIGN_DECLINED' | 'OBT_RETURNED' | 'SEQUENCE_WARNING' | 'INGESTION_FAILURE';
export interface AlertItem { key: string; type: AlertType; severity: 'critical' | 'high' | 'normal'; pkgId?: string; pkgName?: string; milestone?: MilestoneKey; title: string; detail: string; date: ISODate; immediate: boolean }

export function useAlerts(): AlertItem[] {
  const views = useViews();
  const events = useStore((s) => s.events);
  const docs = useStore((s) => s.docs);
  const settings = useStore((s) => s.settings);
  const asOf = useStore((s) => s.asOf);
  const packages = useStore((s) => s.packages);
  return useMemo(() => {
    const out: AlertItem[] = [];
    const name = (id?: string | null) => packages.find((p) => p.id === id)?.name;
    for (const v of views) {
      if (v.pkg.excluded || v.status === 'Awarded') continue;
      for (const c of v.cells) {
        if (c.status === 'DUE_SOON') out.push({ key: `${v.pkg.id}|${c.key}|DUE_SOON|${c.planned}`, type: 'DUE_SOON', severity: 'normal', pkgId: v.pkg.id, pkgName: v.pkg.name, milestone: c.key, date: c.planned!, immediate: false, title: `${M[c.key].name} due ${diffDays(c.planned!, asOf) === 0 ? 'today' : `in ${diffDays(c.planned!, asOf)} day(s)`}`, detail: `Planned ${c.planned}` });
        if (c.status === 'OVERDUE') {
          const od = diffDays(asOf, c.planned!);
          const esc = od >= settings.escalationDays;
          out.push({ key: `${v.pkg.id}|${c.key}|${esc ? 'ESCALATION' : 'OVERDUE'}|${c.planned}`, type: esc ? 'ESCALATION' : 'OVERDUE', severity: esc ? 'high' : 'normal', pkgId: v.pkg.id, pkgName: v.pkg.name, milestone: c.key, date: c.planned!, immediate: false, title: `${M[c.key].name} overdue by ${od} day${od > 1 ? 's' : ''}`, detail: esc ? `Escalation: ≥ ${settings.escalationDays} days overdue` : `Planned ${c.planned}` });
          break; // one overdue alert per package: the earliest open milestone
        }
      }
      if ((v.slippage ?? 0) > settings.slipAlertDays) out.push({ key: `${v.pkg.id}||FORECAST_SLIP|${v.forecastAward}`, type: 'FORECAST_SLIP', severity: 'high', pkgId: v.pkg.id, pkgName: v.pkg.name, date: asOf, immediate: false, title: `Forecast award slips ${v.slippage} days`, detail: `Target ${v.cells[14].planned} → forecast ${v.forecastAward}` });
    }
    for (const e of events) {
      const d = docs.find((x) => x.id === e.docId);
      const when = e.date ?? asOf;
      if (e.reason === 'DOCUSIGN_DECLINED') out.push({ key: `${e.pkgId}|trf_created|DOCUSIGN_DECLINED|${e.id}`, type: 'DOCUSIGN_DECLINED', severity: 'critical', pkgId: e.pkgId!, pkgName: name(e.pkgId), date: when, immediate: true, title: 'DocuSign TRF envelope declined', detail: d?.subject ?? '' });
      else if (e.reason === 'OBT_RETURNED') out.push({ key: `${e.pkgId}|uploaded_to_obt|OBT_RETURNED|${e.id}`, type: 'OBT_RETURNED', severity: 'critical', pkgId: e.pkgId!, pkgName: name(e.pkgId), date: when, immediate: true, title: 'OBT submission returned', detail: d?.subject ?? '' });
      else if (e.decision === 'QUEUED') out.push({ key: `${e.pkgId}|${e.key}|NEW_EXCEPTION|${e.id}`, type: 'NEW_EXCEPTION', severity: 'normal', pkgId: e.pkgId ?? undefined, pkgName: name(e.pkgId), date: when, immediate: false, title: `New exception: ${e.reason?.replace(/_/g, ' ').toLowerCase()}`, detail: d?.subject || d?.fileName || '' });
      if (e.decision === 'ERROR') out.push({ key: `||INGESTION_FAILURE|${e.id}`, type: 'INGESTION_FAILURE', severity: 'critical', date: when, immediate: true, title: 'Ingestion failure', detail: e.ignoredReason ?? '' });
    }
    // as-of awareness: nothing from the future
    const seen = new Set<string>();
    return out.filter((a) => a.date <= asOf || a.type === 'DUE_SOON').filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)))
      .sort((a, b) => ['critical', 'high', 'normal'].indexOf(a.severity) - ['critical', 'high', 'normal'].indexOf(b.severity));
  }, [views, events, docs, settings, asOf, packages]);
}
