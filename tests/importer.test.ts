import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { importWorkbook } from '@/lib/excelImport';
import ref from '../sample_data/schedule_packages.json';

const buf = fs.readFileSync('sample_data/Sample_Project_Doc.xlsm');
const rep = importWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

describe('Excel importer vs schedule_packages.json', () => {
  it('imports 74 packages', () => expect(rep.packages.length).toBe(74));
  it('matches every planned and actual date and SLA', () => {
    const diffs: string[] = [];
    for (const r of (ref as any).packages) {
      const p = rep.packages.find((x) => x.slNo === r.sl_no)!;
      expect(p, `sl ${r.sl_no}`).toBeTruthy();
      expect(p.name).toBe(r.work_package.trim());
      for (const [k, m] of Object.entries<any>(r.milestones)) {
        if ((p.legacy as any)[k] !== m.actual) diffs.push(`${p.name} ${k} actual ${(p.legacy as any)[k]} != ${m.actual}`);
        if (k !== 'award_issued' && (p.sla as any)[k] !== m.sla_days_to_next) diffs.push(`${p.name} ${k} sla ${(p.sla as any)[k]} != ${m.sla_days_to_next}`);
      }
      if (p.plannedAward !== r.milestones.award_issued.planned) diffs.push(`${p.name} plannedAward`);
    }
    expect(diffs).toEqual([]);
  });
  it('normalises managers and OBT refs (D12, S4)', () => {
    expect(new Set(rep.packages.map((p) => p.manager)).has('Mufaddal')).toBe(true);
    expect(rep.packages.find((p) => p.name === 'Facade (2)')!.obtRef).toBe('15004');
  });
  it('flags duplicate names (D18) and excluded packages', () => {
    expect(rep.warnings.some((w) => w.code === 'DUPLICATE_NAME')).toBe(true);
    expect(rep.packages.filter((p) => p.excluded).map((p) => p.name)).toContain('Structural Steel');
  });
});
