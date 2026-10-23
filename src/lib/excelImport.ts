import * as XLSX from 'xlsx';
import { MILESTONES, type MilestoneKey } from '@/domain/milestones';
import { fromMs, type ISODate } from '@/domain/dates';
import type { Bidder, Package } from '@/domain/types';

type Cell = string | number | boolean | null;
type AoA = Cell[][];

export interface ImportReport {
  project: { name: string; reportingWeekEnding: ISODate | null; division: string };
  packages: Package[];
  warnings: { level: 'info' | 'warn'; code: string; message: string }[];
  stats: { rowsScanned: number; packages: number; legacyActuals: number; plannedAnchors: number; excluded: number; slaFromMaster: number };
  slaMaster: Record<string, Record<MilestoneKey, number>>;
}

const clean = (v: Cell): string => (v === null || v === undefined ? '' : String(v)).replace(/[\t\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (v: Cell) => clean(v).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Excel serial → ISO date (timezone-free, so a laptop in any timezone imports the same dates). */
export function toISO(v: Cell): ISODate | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) return fromMs(Math.round((v - 25569) * 86_400_000));
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  }
  return null;
}

const MANAGER_ALIASES: Record<string, string> = {
  muffadal: 'Mufaddal', mufaddal: 'Mufaddal', basheer: 'Basheer', mani: 'Mani', vaibhav: 'Vaibhav',
  syed: 'Syed', siteteam: 'Unassigned (Site Team)',
};
export function normaliseManager(raw: string): string {
  const k = norm(raw);
  if (!k) return 'Unassigned';
  return MANAGER_ALIASES[k] ?? raw.trim().replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

const EXCLUDE_RE = /no further action from procurement|part of .*(package|scope)/i;

function findHeader(rows: AoA, must: string[]): number {
  return rows.findIndex((r) => must.every((m) => r.some((c) => norm(c) === norm(m))));
}
const colOf = (header: Cell[], name: string, from = 0) => header.findIndex((c, i) => i >= from && norm(c) === norm(name));

function readSheet(wb: XLSX.WorkBook, name: string): AoA | null {
  const key = wb.SheetNames.find((n) => norm(n) === norm(name));
  if (!key) return null;
  return XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[key], { header: 1, raw: true, defval: null });
}

export function importWorkbook(data: ArrayBuffer): ImportReport {
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  const warnings: ImportReport['warnings'] = [];

  // ---- SLA master (Work Package Master List)
  const slaMaster: ImportReport['slaMaster'] = {};
  const wm = readSheet(wb, 'Work Package Master List');
  if (wm) {
    const h = findHeader(wm, ['Standard Reference No.', 'DTP Received']);
    if (h >= 0) {
      const hdr = wm[h];
      const refCol = colOf(hdr, 'Standard Reference No.');
      const cols = MILESTONES.map((m) => colOf(hdr, m.key === 'award_issued' ? 'LPO/ LOA/ SOA Issue Date' : m.name.replace(' / ', '/ ')));
      for (const r of wm.slice(h + 1)) {
        const ref = clean(r[refCol]).toUpperCase();
        if (!/^[A-Z]\d{4}$/.test(ref)) continue;
        slaMaster[ref] = Object.fromEntries(MILESTONES.map((m, i) => [m.key, Number(r[cols[i]] ?? m.defaultSla) || 0])) as Record<MilestoneKey, number>;
      }
    }
  } else warnings.push({ level: 'warn', code: 'NO_SLA_MASTER', message: 'Work Package Master List sheet not found — default SLAs used.' });

  // ---- Strategy (bidders)
  const bidders = new Map<number, { list: Bidder[]; cost: number | null }>();
  const st = readSheet(wb, 'Procurement Strategy');
  if (st) {
    const h = findHeader(st, ['Sl.No', 'Work Package', 'Vendors']);
    if (h >= 0) {
      const hdr = st[h];
      const [cSl, cInst, cVen, cInit, cAw, cCost] = ['Sl.No', 'Vendor Instance', 'Vendors', 'Initial Proposal', 'Awarded', 'Cost'].map((n) => colOf(hdr, n));
      let cur: number | null = null;
      for (const r of st.slice(h + 1)) {
        if (typeof r[cSl] === 'number') {
          cur = r[cSl] as number;
          bidders.set(cur, { list: [], cost: typeof r[cCost] === 'number' ? (r[cCost] as number) : null });
        } else if (cur !== null && r[cInst] !== null && clean(r[cVen])) {
          bidders.get(cur)!.list.push({
            vendor: clean(r[cVen]), awarded: norm(r[cAw]) === 'yes',
            initialProposal: typeof r[cInit] === 'number' ? (r[cInit] as number) : null,
          });
        }
      }
    }
  }

  // ---- Procurement Schedule
  const rows = readSheet(wb, 'Procurement Schedule');
  if (!rows) throw new Error('This workbook has no "Procurement Schedule" sheet. Upload the Dutco project tracker (.xlsm / .xlsx).');
  const h = findHeader(rows, ['Work Package', 'Entry Type', 'DTP Received']);
  if (h < 0) throw new Error('Could not find the schedule header row (looked for "Work Package", "Entry Type", "DTP Received").');
  const hdr = rows[h];
  const c = {
    sl: colOf(hdr, 'Sl.No'), cat: colOf(hdr, 'Category'), wp: colOf(hdr, 'Work Package'), ref: colOf(hdr, 'Standard Reference No.'),
    mgr: colOf(hdr, 'Package Manager'), added: colOf(hdr, 'Date Added'), entry: colOf(hdr, 'Entry Type'),
    obt: colOf(hdr, 'OBT Ref'), award: hdr.findIndex((x) => norm(x).startsWith('lpoloa')), status: colOf(hdr, 'Status'),
    comments: colOf(hdr, 'Comments'),
  };
  const msCols = MILESTONES.map((m) => (m.key === 'award_issued' ? c.award : colOf(hdr, m.name)));
  msCols.forEach((col, i) => { if (col < 0) warnings.push({ level: 'warn', code: 'MISSING_COLUMN', message: `Column "${MILESTONES[i].name}" not found.` }); });

  // Reporting week from row ~3 ("Reporting Period (w/e)") on Project Information
  let reportingWeekEnding: ISODate | null = null;
  const pi = readSheet(wb, 'Project Information');
  pi?.forEach((r) => { const i = r.findIndex((x) => norm(x).startsWith('reportingperiod')); if (i >= 0) reportingWeekEnding ??= toISO(r[i + 1]); });

  const packages: Package[] = [];
  const seenNames = new Map<string, number>();
  let legacyActuals = 0, slaFromMaster = 0;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    if (norm(r[c.entry]) !== 'planned') continue;
    const name = clean(r[c.wp]);
    if (!name) continue; // blank template rows (Sl.No without a work package)
    const a = rows[i + 1] && norm(rows[i + 1][c.entry]) === 'actual' ? rows[i + 1] : [];
    const slNo = Number(r[c.sl]);
    const ref = clean(r[c.ref]).toUpperCase();
    const master = slaMaster[ref];
    let slaDefaulted = false;
    const sla = Object.fromEntries(MILESTONES.map((m, k) => {
      const v = r[msCols[k] + 1];
      if (typeof v === 'number') return [m.key, v];
      if (master) { slaFromMaster++; return [m.key, master[m.key]]; }
      slaDefaulted = true; return [m.key, m.defaultSla];
    })) as Record<MilestoneKey, number>;
    sla.award_issued = 0;
    if (!master && ref) { slaDefaulted = true; warnings.push({ level: 'warn', code: 'SLA_DEFAULTED', message: `${name}: reference ${ref} not in SLA master; using defaults where the sheet is blank.` }); }
    const legacy = Object.fromEntries(MILESTONES.map((m, k) => [m.key, toISO(a[msCols[k]] ?? null)])) as Record<MilestoneKey, ISODate | null>;
    legacyActuals += Object.values(legacy).filter(Boolean).length;
    const obtRaw = clean(a[c.obt] ?? null) || clean(r[c.obt]);
    const comments = clean(r[c.comments]);
    const id = `p${slNo}`;
    const dupe = seenNames.get(name.toLowerCase());
    if (dupe !== undefined) warnings.push({ level: 'warn', code: 'DUPLICATE_NAME', message: `"${name}" appears twice (Sl.No ${dupe} and ${slNo}); kept apart by Sl.No.` });
    seenNames.set(name.toLowerCase(), slNo);
    const b = bidders.get(slNo);
    packages.push({
      id, slNo, category: clean(r[c.cat]), name, ref, managerRaw: clean(r[c.mgr]), manager: normaliseManager(clean(r[c.mgr])),
      dateAdded: toISO(r[c.added]), obtRef: obtRaw ? obtRaw.replace(/\.0$/, '') : null, comments,
      sheetStatus: clean(r[c.status]), excluded: EXCLUDE_RE.test(comments), isDemo: false,
      plannedAward: toISO(r[c.award]), plannedDtp: toISO(r[msCols[0]]), sla, slaDefaulted, legacy,
      bidders: b?.list ?? [], awardedCost: b?.cost ?? null, sheetRows: { planned: i + 1, actual: i + 2 },
    });
  }
  const excluded = packages.filter((p) => p.excluded).length;
  if (excluded) warnings.push({ level: 'info', code: 'EXCLUDED', message: `${excluded} packages are handled outside procurement (from comments) and are excluded from SLA metrics.` });
  return {
    project: { name: 'Sample Project (name withheld)', reportingWeekEnding, division: 'DCC' },
    packages, warnings, slaMaster,
    stats: { rowsScanned: rows.length, packages: packages.length, legacyActuals, plannedAnchors: packages.filter((p) => p.plannedAward).length, excluded, slaFromMaster },
  };
}
