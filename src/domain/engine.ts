import { diffDays, shift, type DayCounting, type ISODate } from './dates';
import { MILESTONES, OWNERS, type MilestoneKey, type Owner, type PackageStatus } from './milestones';
import type { ActualRecord, CellView, Health, MilestoneStatus, Package, PackageView, Rebaseline } from './types';

export interface EngineSettings {
  plannedMode: 'BACKWARD_FROM_AWARD' | 'FORWARD_FROM_DTP';
  dayCounting: DayCounting;
  dueSoonDays: number;
  escalationDays: number;
  slipAlertDays: number;
  planAnomalyDays: number;
  ownerMap: Record<MilestoneKey, Owner>;
}

export function plannedDates(pkg: Package, s: EngineSettings): (ISODate | null)[] {
  const out: (ISODate | null)[] = MILESTONES.map(() => null);
  const sla = MILESTONES.map((m) => pkg.sla[m.key] ?? m.defaultSla);
  if (s.plannedMode === 'BACKWARD_FROM_AWARD') {
    if (!pkg.plannedAward) return out; // D1: plan not set
    out[14] = pkg.plannedAward;
    for (let i = 13; i >= 0; i--) out[i] = shift(out[i + 1]!, -sla[i], s.dayCounting);
  } else {
    if (!pkg.plannedDtp) return out;
    out[0] = pkg.plannedDtp;
    for (let i = 1; i < 15; i++) out[i] = shift(out[i - 1]!, sla[i - 1], s.dayCounting);
  }
  return out;
}

/** D13: admin correction > system-captured > legacy manual. Superseded records never display. */
export function effectiveActual(records: ActualRecord[]): ActualRecord | undefined {
  const live = records.filter((r) => !r.supersededBy);
  const rank = { ADMIN: 3, SYSTEM: 2, LEGACY: 1 } as const;
  const maxRound = Math.max(0, ...live.filter((r) => r.source !== 'LEGACY').map((r) => r.round));
  return live
    .filter((r) => r.source === 'LEGACY' || r.round === maxRound)
    .sort((a, b) => rank[b.source] - rank[a.source] || b.at.localeCompare(a.at))[0];
}

export function cellStatus(
  actual: ISODate | null, planned: ISODate | null, asOf: ISODate, laterDone: boolean,
  optional: boolean, dueSoon: number,
): MilestoneStatus {
  if (actual) return planned ? (actual <= planned ? 'DONE_ON_TIME' : 'DONE_LATE') : 'NO_PLAN';
  if (laterDone) return optional ? 'NOT_APPLICABLE' : 'SKIPPED_MISSING';
  if (!planned) return 'NO_PLAN';
  if (asOf > planned) return 'OVERDUE';
  if (diffDays(planned, asOf) <= dueSoon) return 'DUE_SOON';
  return 'UPCOMING';
}

export function computePackage(
  pkg: Package, records: ActualRecord[], rebaselines: Rebaseline[], s: EngineSettings, asOf: ISODate,
): PackageView {
  const baseline = plannedDates(pkg, s);
  const planned = baseline.map((d, i) => {
    const rb = rebaselines.filter((r) => r.pkgId === pkg.id && r.key === MILESTONES[i].key).at(-1);
    return rb ? rb.date : d;
  });
  const recs = MILESTONES.map((m) => effectiveActual(records.filter((r) => r.key === m.key)));
  // D16 / E29: anything dated after the as-of date is "not yet" for this view
  const actual = recs.map((r) => (r && r.date <= asOf ? r.date : null));
  const hiddenFuture = recs.map((r) => !!r && r.date > asOf);
  let lastIdx = -1;
  actual.forEach((a, i) => { if (a) lastIdx = i; });

  const cells: CellView[] = MILESTONES.map((m, i) => {
    const sla = pkg.sla[m.key] ?? m.defaultSla;
    const st = cellStatus(actual[i], planned[i], asOf, i < lastIdx, !!m.optional, s.dueSoonDays);
    return {
      key: m.key, planned: planned[i], baseline: baseline[i], actual: actual[i],
      provenance: actual[i] ? recs[i]!.source : null, record: actual[i] ? recs[i] : undefined,
      hiddenFuture: hiddenFuture[i], status: st,
      variance: actual[i] && planned[i] ? diffDays(actual[i]!, planned[i]!) : null,
      cycle: null, sla, overSla: 0,
    };
  });

  // Step cycle time between consecutive captured milestones; excess goes to the owner of the step being waited on.
  const daysLost = Object.fromEntries(OWNERS.map((o) => [o, 0])) as Record<Owner, number>;
  let prev = -1;
  cells.forEach((c, i) => {
    if (!c.actual) return;
    if (prev >= 0) {
      const cyc = diffDays(c.actual, cells[prev].actual!);
      const allowed = cells.slice(prev, i).reduce((t, x) => t + x.sla, 0);
      c.cycle = cyc;
      c.overSla = Math.max(0, cyc - allowed);
      if (cyc >= 0) daysLost[s.ownerMap[c.key]] += c.overSla;
    } else if (c.variance && c.variance > 0 && i === 0) {
      c.overSla = c.variance;
      daysLost[s.ownerMap[c.key]] += c.variance;
    }
    prev = i;
  });

  const status: PackageStatus = lastIdx >= 0 ? MILESTONES[lastIdx].statusLabel : 'Awaiting DTP';

  const flags: string[] = [];
  const seq = actual.filter(Boolean) as ISODate[];
  if (seq.some((d, i) => i > 0 && d < seq[i - 1])) flags.push('SEQUENCE_WARNING');
  if (cells.some((c) => c.variance !== null && Math.abs(c.variance) > s.planAnomalyDays)) flags.push('PLAN_ANOMALY');
  if (pkg.slaDefaulted) flags.push('SLA_DEFAULTED');
  if (status === 'Awarded' && seq.length < 6) flags.push('AWARDED_INCOMPLETE');
  if (!planned[14]) flags.push('PLAN_NOT_SET');

  // Forecast award = latest actual + remaining SLA (or planned award if later); stale steps roll forward from as-of.
  let forecast: ISODate | null = null;
  if (actual[14]) forecast = actual[14];
  else {
    const remaining = (from: number) => cells.slice(from).reduce((t, c) => t + c.sla, 0);
    const base = lastIdx >= 0 ? shift(actual[lastIdx]!, remaining(lastIdx), s.dayCounting) : planned[14];
    if (base) {
      let f: ISODate = base;
      if (planned[14] && planned[14] > f) f = planned[14];
      const nextPlanned = planned[lastIdx + 1];
      if (nextPlanned && asOf > nextPlanned) {
        const rolled = shift(asOf, remaining(lastIdx + 1), s.dayCounting);
        if (rolled > f) f = rolled;
      }
      forecast = f;
    }
  }
  const slippage = forecast && planned[14] ? diffDays(forecast, planned[14]) : null;

  let health: Health = 'On Track';
  if (pkg.excluded) health = 'Excluded';
  else if (status !== 'Awarded') {
    const worstOver = Math.max(0, ...cells.filter((c) => c.status === 'OVERDUE').map((c) => diffDays(asOf, c.planned!)));
    if (worstOver >= s.escalationDays || (slippage ?? 0) > s.slipAlertDays) health = 'Delayed';
    else if (worstOver > 0 || cells.some((c) => c.status === 'DUE_SOON') || (slippage ?? 0) > 0) health = 'At Risk';
  }

  const actualCount = seq.length;
  const sys = cells.filter((c) => c.provenance === 'SYSTEM' || c.provenance === 'ADMIN').length;
  return {
    pkg, cells, status, health, forecastAward: forecast, slippage, lastActualIdx: lastIdx, flags, daysLost,
    systemShare: actualCount ? sys / actualCount : 0, actualCount,
  };
}

/** SLA compliance = steps completed within SLA / steps completed (§5.6). Excluded packages never count. */
export function compliance(views: PackageView[], filter: (v: PackageView, c: CellView) => boolean = () => true) {
  let done = 0, ok = 0;
  for (const v of views) {
    if (v.pkg.excluded) continue;
    for (const c of v.cells) if (c.cycle !== null && c.cycle >= 0 && filter(v, c)) { done++; if (c.overSla === 0) ok++; }
  }
  return { done, ok, pct: done ? ok / done : 0 };
}
