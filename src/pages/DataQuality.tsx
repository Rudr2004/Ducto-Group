import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useStore } from '@/store/store';
import { MILESTONES } from '@/domain/milestones';
import findings from '@/data/data_quality_findings.json';
import { PageHeader, Section } from '@/components/ui';

const TYPES: Record<string, { label: string; explain: string }> = {
  out_of_sequence: { label: 'Out-of-sequence dates', explain: 'A later milestone is dated before an earlier one.' },
  awarded_with_missing_actuals: { label: 'Awarded but incomplete', explain: 'Marked awarded with fewer than 6 of 15 actual dates.' },
  no_named_owner: { label: 'No named owner', explain: '“SITE TEAM” instead of a package manager.' },
  shared_reference_code: { label: 'Shared reference codes', explain: 'Split packages share one Standard Reference No.' },
  comment_vendor_mismatch: { label: 'Comment vs strategy vendor', explain: 'The comment names a different vendor than the Strategy sheet (heuristic).' },
  owner_name_variants: { label: 'Owner name variants', explain: 'The same person spelled differently.' },
};

export default function DataQuality() {
  const { packages, records, openPkg } = useStore();
  const [type, setType] = useState<string>('out_of_sequence');
  const list = findings as { package: string; type: string; detail: string }[];
  const counts = Object.keys(TYPES).map((t) => ({ t, n: list.filter((f) => f.type === t).length }));

  const compare = useMemo(() => {
    const demo = packages.filter((p) => p.isDemo);
    const legacy = (p: (typeof demo)[number]) => MILESTONES.map((m) => p.legacy[m.key]);
    const sys = (p: (typeof demo)[number]) => MILESTONES.map((m) => records.find((r) => r.pkgId === p.id && r.key === m.key && r.source === 'SYSTEM' && !r.supersededBy)?.date ?? null);
    const stats = (get: (p: (typeof demo)[number]) => (string | null)[]) => {
      let filled = 0, seq = 0, conflicts = 0;
      demo.forEach((p) => {
        const ds = get(p); const last = ds.reduce((a, d, i) => (d ? i : a), -1);
        filled += ds.slice(0, last + 1).filter(Boolean).length / Math.max(1, last + 1);
        const seen = ds.filter(Boolean) as string[];
        if (seen.some((d, i) => i > 0 && d < seen[i - 1])) seq++;
      });
      demo.forEach((p) => MILESTONES.forEach((m, i) => { const s = sys(p)[i]; if (s && p.legacy[m.key] && p.legacy[m.key] !== s) conflicts++; }));
      return { completeness: demo.length ? filled / demo.length : 0, seq, conflicts };
    };
    return { n: demo.length, manual: stats(legacy), system: stats(sys), captured: demo.reduce((t, p) => t + sys(p).filter(Boolean).length, 0) };
  }, [packages, records]);

  const rows = list.filter((f) => f.type === type);
  return (
    <div>
      <PageHeader title="Data quality" desc="What the manual tracker looks like today — the business case for automatic capture." />
      <div className="card grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 overflow-hidden mb-4">
        {counts.map(({ t, n }) => (
          <button key={t} onClick={() => setType(t)} className="text-left p-4 hover:bg-[var(--sunken)]" style={{ borderLeft: '1px solid var(--line)', marginLeft: -1, borderTop: '1px solid var(--line)', marginTop: -1, background: type === t ? 'var(--sunken)' : undefined, boxShadow: type === t ? 'inset 0 -2px var(--teal)' : undefined }}>
            <div className="text-[28px] font-semibold num leading-none">{n}</div>
            <div className="text-[12.5px] font-medium mt-1.5">{TYPES[t].label}</div>
            <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{TYPES[t].explain}</div>
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <Section title={`${TYPES[type].label} · ${rows.length}`} desc="From the imported workbook. Findings are surfaced, never auto-corrected." pad={false}>
          <ul className="max-h-[440px] overflow-y-auto">
            {rows.map((f, i) => {
              const p = packages.find((x) => x.name === f.package);
              return <li key={i} style={{ borderTop: '1px solid var(--line)' }}><button className="w-full text-left px-4 py-2 hover:bg-[var(--sunken)]" onClick={() => p && openPkg(p.id)}><div className="text-[13px] font-medium">{f.package}</div><div className="text-[12px] num" style={{ color: 'var(--muted)' }}>{f.detail}</div></button></li>;
            })}
          </ul>
        </Section>
        <Section title="Before vs after" desc={`The ${compare.n} POC packages: manual sheet vs system-captured.`}>
          {compare.captured === 0 ? (
            <div className="flex items-center gap-3 rounded-lg p-4 text-[13px]" style={{ background: 'var(--sunken)' }}><ShieldAlert size={18} style={{ color: 'var(--teal)' }} />Process the demo mailbox on the Ingest page to fill the “after” column.</div>
          ) : (
            <table className="w-full text-[13px] num">
              <thead><tr className="text-left text-[12px]" style={{ color: 'var(--muted)' }}><th className="font-medium py-2">Measure</th><th className="font-medium py-2 text-right">Manual sheet</th><th className="font-medium py-2 text-right">System-captured</th></tr></thead>
              <tbody>
                {[
                  ['Completeness (up to latest step)', `${Math.round(compare.manual.completeness * 100)}%`, `${Math.round(compare.system.completeness * 100)}%`],
                  ['Packages with sequence errors', compare.manual.seq, compare.system.seq],
                  ['Dates with evidence link', '0', String(compare.captured)],
                  ['Legacy dates that disagree with evidence', '—', String(compare.system.conflicts)],
                ].map(([l, a, b]) => <tr key={l as string} style={{ borderTop: '1px solid var(--line)' }}><td className="py-2.5">{l}</td><td className="py-2.5 text-right" style={{ color: 'var(--muted)' }}>{a}</td><td className="py-2.5 text-right font-semibold" style={{ color: 'var(--teal)' }}>{b}</td></tr>)}
              </tbody>
            </table>
          )}
          <p className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>When a legacy date conflicts with a system-captured one, the system date is shown and the legacy value stays visible in the package history.</p>
        </Section>
      </div>
    </div>
  );
}
