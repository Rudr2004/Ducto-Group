import * as XLSX from 'xlsx';
import { MILESTONES, OWNERS } from '@/domain/milestones';
import type { PackageView } from '@/domain/types';
import type { EvidenceEvent, SourceDoc } from '@/pipeline/types';
import { toMs, type ISODate } from '@/domain/dates';

const xlDate = (d: ISODate | null) => (d ? (toMs(d) / 86_400_000) + 25569 : null);
const STAGE_LABEL: Record<string, string> = { A: 'A: Post-Award Strategy Stage', B: 'B: Tender Stage', C: 'C: Tender Review Stage', D: 'D: Award Stage' };

/** Regenerates the Procurement Schedule in Dutco's layout: header rows 7–11, two rows per package (Planned / Actual), columns B..AP. */
export function exportSchedule(views: PackageView[], events: EvidenceEvent[], docs: SourceDoc[], asOf: ISODate) {
  const aoa: (string | number | null)[][] = [];
  const W = 42; // columns A..AP
  const blank = () => Array<string | number | null>(W).fill(null);
  const msCol = (i: number) => (i < 14 ? 9 + i * 2 : 38); // J=9 … AJ=35, AM=38 (0-based)
  for (let r = 0; r < 11; r++) aoa.push(blank());
  aoa[0][1] = 'Procurement Schedule — exported by Procurement Control Tower';
  aoa[1][1] = `As of ${asOf}. Actual dates are system-captured unless marked otherwise (see cell comments and the Evidence sheet). Macros are not preserved.`;
  MILESTONES.forEach((m, i) => { aoa[6][msCol(i)] = m.statusLabel; aoa[8][msCol(i)] = m.code; });
  MILESTONES.forEach((m, i) => { if (i === 0 || MILESTONES[i - 1].stage !== m.stage) aoa[7][msCol(i)] = STAGE_LABEL[m.stage]; });
  aoa[7][8] = 'Stage'; aoa[8][8] = 'Step';
  const hdr = aoa[10];
  ['Sl.No', 'Category', 'Work Package', 'Standard Reference No.', 'Preferred Vendor', 'Package Manager', 'Date Added', 'Entry Type'].forEach((h, i) => { hdr[1 + i] = h; });
  MILESTONES.slice(0, 14).forEach((m, i) => { hdr[msCol(i)] = m.name; hdr[msCol(i) + 1] = 'Duration'; });
  hdr[37] = 'OBT Ref'; hdr[38] = 'LPO/ LOA/ SOA Issue Date'; hdr[39] = 'Date of Last Action'; hdr[40] = 'Status'; hdr[41] = 'Comments';
  const comments: { r: number; c: number; t: string }[] = [];
  for (const v of views) {
    const pr = blank(), ar = blank();
    pr[1] = v.pkg.slNo; pr[2] = v.pkg.category; pr[3] = v.pkg.name; pr[4] = v.pkg.ref; pr[6] = v.pkg.managerRaw; pr[7] = xlDate(v.pkg.dateAdded); pr[8] = 'Planned'; ar[8] = 'Actual';
    v.cells.forEach((c, i) => {
      pr[msCol(i)] = xlDate(c.planned); if (i < 14) pr[msCol(i) + 1] = c.sla;
      ar[msCol(i)] = xlDate(c.actual);
      if (c.actual) {
        const ev = c.record?.evidenceId ? events.find((e) => e.id === c.record!.evidenceId) : undefined;
        const doc = ev ? docs.find((d) => d.id === ev.docId) : undefined;
        comments.push({ r: aoa.length + 1, c: msCol(i), t: c.provenance === 'LEGACY' ? 'Legacy (manual) — typed in the original tracker; not verified evidence.' : c.provenance === 'ADMIN' ? `Admin-corrected: ${c.record?.reason ?? ''}` : `System-captured (${Math.round((c.record?.confidence ?? 1) * 100)}%) from ${doc?.kind ?? 'evidence'}: ${doc?.subject ?? ev?.id ?? ''}` });
      }
    });
    ar[37] = v.pkg.obtRef; ar[39] = xlDate(v.cells.filter((c) => c.actual).map((c) => c.actual!).sort().at(-1) ?? null);
    pr[40] = v.pkg.excluded ? 'Excluded' : v.status; pr[41] = v.pkg.comments;
    aoa.push(pr, ar);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // date formats
  for (let r = 11; r < aoa.length; r++) for (const c of [7, ...MILESTONES.map((_, i) => msCol(i)), 39]) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (ws[ref] && typeof ws[ref].v === 'number') { ws[ref].t = 'n'; ws[ref].z = 'dd-mmm-yy'; }
  }
  for (const cm of comments) { const ref = XLSX.utils.encode_cell({ r: cm.r, c: cm.c }); if (ws[ref]) ws[ref].c = [{ a: 'Control Tower', t: cm.t }]; }
  ws['!cols'] = Array.from({ length: W }, (_, i) => ({ wch: i === 3 ? 32 : i === 41 ? 40 : i >= 9 && i < 37 && i % 2 === 0 ? 5 : 11 }));

  const ev = [['Package', 'Milestone', 'Round', 'Date (Dubai)', 'Decision', 'Confidence', 'Source type', 'Source file', 'Subject', 'From', 'Rule hits', 'AI rationale']];
  for (const e of events.filter((x) => x.decision === 'AUTO_COMMITTED')) {
    const d = docs.find((x) => x.id === e.docId);
    ev.push([views.find((v) => v.pkg.id === e.pkgId)?.pkg.name ?? '', String(e.key ?? ''), String(e.round), e.date ?? '', e.resolution ?? e.decision, e.confidence.toFixed(3), d?.kind ?? '', d?.fileName ?? '', d?.subject ?? '', d?.from.email ?? '', e.ruleHits.join('; '), e.ai?.rationale ?? '']);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Procurement Schedule');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ev), 'Evidence');
  XLSX.writeFile(wb, `Procurement_Schedule_${asOf}.xlsx`);
}

export function exportDashboardData(views: PackageView[], asOf: ISODate) {
  const rows = views.map((v) => ({
    'Sl.No': v.pkg.slNo, Package: v.pkg.name, Ref: v.pkg.ref, Category: v.pkg.category, Manager: v.pkg.manager, Status: v.status, Health: v.health,
    'Target award': v.cells[14].planned ?? '', 'Forecast award': v.forecastAward ?? '', 'Slippage (d)': v.slippage ?? '', Excluded: v.pkg.excluded ? 'Yes' : '',
    ...Object.fromEntries(OWNERS.map((o) => [`Days lost – ${o}`, v.daysLost[o]])), 'System-captured %': Math.round(v.systemShare * 100), Flags: v.flags.join(', '),
  }));
  const ms = views.flatMap((v) => v.cells.map((c) => ({ Package: v.pkg.name, Milestone: MILESTONES.find((m) => m.key === c.key)!.name, Planned: c.planned ?? '', Actual: c.actual ?? '', Status: c.status, 'Variance (d)': c.variance ?? '', 'Cycle (d)': c.cycle ?? '', SLA: c.sla, 'Over SLA (d)': c.overSla, Provenance: c.provenance ?? '' })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Packages');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ms), 'Milestones');
  XLSX.writeFile(wb, `Control_Tower_data_${asOf}.xlsx`);
}
