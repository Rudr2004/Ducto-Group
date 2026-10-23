import { useState, type ReactNode } from 'react';
import { Mail, FolderOpen, FileSignature, Landmark, Cloud, Bot, Lock, RotateCcw, UploadCloud } from 'lucide-react';
import { useStore } from '@/store/store';
import { MILESTONES, OWNERS, type Owner } from '@/domain/milestones';
import { PageHeader, Section, Segmented, cx } from '@/components/ui';

export default function Settings() {
  const { settings, setSettings, role, toast, reset, packages, ctx, synth } = useStore();
  const admin = role === 'admin';
  const [tab, setTab] = useState<'rules' | 'people' | 'connectors' | 'ai'>('rules');
  const save = (p: Parameters<typeof setSettings>[0]) => { try { setSettings(p); toast({ tone: 'ok', title: 'Setting saved', body: 'Change recorded in the audit log' }); } catch (e) { toast({ tone: 'error', title: (e as Error).message }); } };
  const aliases = [...new Map(packages.map((p) => [p.managerRaw, p.manager])).entries()].filter(([raw]) => raw).sort();

  return (
    <div>
      <PageHeader title="Settings" desc="Every assumption awaiting Dutco’s answer is a setting here, not code." actions={<Segmented label="Settings section" value={tab} onChange={setTab} options={[{ value: 'rules', label: 'Rules & SLA' }, { value: 'people', label: 'People & suppliers' }, { value: 'connectors', label: 'Connectors' }, { value: 'ai', label: 'AI & demo' }]} />} />
      {!admin && <div className="card p-3 mb-4 text-[13px] flex items-center gap-2" style={{ background: 'var(--sunken)' }}><Lock size={14} />Read-only — only the administrator can change settings.</div>}
      {tab === 'rules' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Planned dates" desc="Open question Q3 / Q4 to Dutco.">
            <Row label="Planned-date mode" hint="Backward from the typed target award (how the sheet works) or forward from DTP (as described on the call).">
              <select className="input" disabled={!admin} value={settings.plannedMode} onChange={(e) => save({ plannedMode: e.target.value as never })}><option value="BACKWARD_FROM_AWARD">Backward from target award</option><option value="FORWARD_FROM_DTP">Forward from planned DTP</option></select>
            </Row>
            <Row label="Day counting" hint="Working days use a Sat–Sun weekend and the holiday list.">
              <select className="input" disabled={!admin} value={settings.dayCounting.mode} onChange={(e) => save({ dayCounting: { ...settings.dayCounting, mode: e.target.value as never } })}><option value="calendar">Calendar days</option><option value="working">Working days</option></select>
            </Row>
            <Row label="Holidays" hint="One date per line, Asia/Dubai.">
              <textarea className="input py-2 h-24 num w-40" disabled={!admin} defaultValue={settings.dayCounting.holidays.join('\n')} onBlur={(e) => save({ dayCounting: { ...settings.dayCounting, holidays: e.target.value.split(/\s+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) } })} />
            </Row>
          </Section>
          <Section title="Thresholds">
            {([['autoCommitThreshold', 'Auto-commit confidence', 'Below this, items go to the exception queue.', 0.5, 0.99, 0.01], ['dueSoonDays', 'Due-soon window (days)', '', 0, 14, 1], ['escalationDays', 'Escalate when overdue (days)', '', 1, 30, 1], ['slipAlertDays', 'Forecast slip alert (days)', '', 1, 60, 1], ['planAnomalyDays', 'Plan anomaly (days)', 'Flag when actual and plan differ by more.', 30, 365, 5]] as const).map(([k, l, h, min, max, stepv]) => (
              <Row key={k} label={l} hint={h}>
                <input type="number" className="input w-24 num" disabled={!admin} min={min} max={max} step={stepv}
                  value={k === 'autoCommitThreshold' ? settings.match.autoCommitThreshold : settings[k]}
                  onChange={(e) => { const v = +e.target.value; if (k === 'autoCommitThreshold') save({ match: { ...settings.match, autoCommitThreshold: v } }); else save({ [k]: v } as never); }} />
              </Row>
            ))}
          </Section>
          <Section title="Milestones: aggregation rule and delay owner" desc="Who the step was waiting on when it overran its SLA." className="lg:col-span-2" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[12px]" style={{ color: 'var(--muted)' }}><th className="font-medium px-4 py-2">Step</th><th className="font-medium py-2">Milestone</th><th className="font-medium py-2">Date rule</th><th className="font-medium py-2">Default SLA</th><th className="font-medium py-2">Evidence source</th><th className="font-medium py-2 pr-4">Delay owner</th></tr></thead>
                <tbody>{MILESTONES.map((m) => (
                  <tr key={m.key} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="px-4 py-1.5 num" style={{ color: 'var(--muted)' }}>{m.code}</td><td className="py-1.5 font-medium">{m.name}{m.optional && <span className="text-[11px] ml-1.5" style={{ color: 'var(--faint)' }}>optional</span>}</td>
                    <td className="py-1.5 text-[12px]">{m.rule}{m.key === 'initial_proposals_received' ? ' before first bid tab' : m.key === 'final_bid_tab' ? ' before TRF' : ''}</td>
                    <td className="py-1.5 num">{m.defaultSla}d</td><td className="py-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>{m.source}</td>
                    <td className="py-1.5 pr-4"><select className="input h-8" disabled={!admin} value={settings.ownerMap[m.key]} onChange={(e) => save({ ownerMap: { ...settings.ownerMap, [m.key]: e.target.value as Owner } })}>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
      {tab === 'people' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="People & aliases" desc="Raw names from the sheet → person. Learned from the import." pad={false}>
            <table className="w-full text-[13px]"><tbody>{aliases.map(([raw, p]) => <tr key={raw} style={{ borderTop: '1px solid var(--line)' }}><td className="px-4 py-2 num" style={{ color: 'var(--muted)' }}>“{raw}”</td><td className="py-2">→</td><td className="py-2 pr-4 font-medium">{p}</td></tr>)}</tbody></table>
          </Section>
          <Section title="Suppliers & domains" desc="From the Strategy sheet (synthetic domains in the POC). Learned rules appear here after queue decisions." pad={false}>
            <table className="w-full text-[13px]"><tbody>{synth?.suppliers.map((s) => <tr key={s.name} style={{ borderTop: '1px solid var(--line)' }}><td className="px-4 py-2 font-medium">{s.name}</td><td className="py-2 num" style={{ color: 'var(--muted)' }}>{s.domains.join(', ')}</td><td className="py-2 pr-4 text-[12px]" style={{ color: 'var(--teal)' }}>{ctx?.learned[s.name] ? `learned → ${packages.find((p) => p.id === ctx.learned[s.name])?.name}` : ''}</td></tr>)}</tbody></table>
          </Section>
        </div>
      )}
      {tab === 'connectors' && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[
            { n: 'Folder & upload', d: '.eml, .xlsm/.xlsx, event JSON/CSV dropped on the Ingest page.', I: UploadCloud, s: 'Active' },
            { n: 'SharePoint (simulated)', d: 'DTP/STP folder events from JSON — same interface as the Graph connector.', I: FolderOpen, s: 'Active · simulator' },
            { n: 'DocuSign (simulated)', d: 'Envelope sent / completed / declined / voided from JSON.', I: FileSignature, s: 'Active · simulator' },
            { n: 'OBT export (simulated)', d: 'Submitted / approved / returned rows from CSV.', I: Landmark, s: 'Active · simulator' },
            { n: 'Microsoft 365 (Graph)', d: 'Individual mailboxes via app-only Mail.Read with delta queries and webhooks; SharePoint Sites.Read.All. Needs approval from Dutco IT Applications Head.', I: Mail, s: 'Stage 2' },
            { n: 'OBT API', d: 'Dutco confirmed an API/export exists. Access after Stage 1.', I: Cloud, s: 'Stage 2' },
            { n: 'DocuSign Connect', d: 'Webhooks + eSignature API instead of files.', I: FileSignature, s: 'Stage 2' },
          ].map((c) => (
            <div key={c.n} className="card p-4">
              <div className="flex items-center gap-2 mb-1.5"><c.I size={16} style={{ color: c.s.startsWith('Stage') ? 'var(--faint)' : 'var(--teal)' }} /><span className="font-semibold text-[13.5px]">{c.n}</span>
                <span className={cx('ml-auto text-[11px] font-semibold rounded-full px-2 py-0.5')} style={c.s.startsWith('Stage') ? { background: 'var(--sunken)', color: 'var(--muted)', border: '1px dashed var(--line-strong)' } : { background: 'var(--ok-bg)', color: 'var(--ok)' }}>{c.s}</span></div>
              <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>{c.d}</p>
            </div>
          ))}
        </div>
      )}
      {tab === 'ai' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="AI status">
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt style={{ color: 'var(--muted)' }}>Mode</dt><dd className="flex items-center gap-1.5"><Bot size={14} />{settings.aiOutage ? 'Offline (degraded)' : 'Simulated classifier (no API key in browser)'}</dd>
              <dt style={{ color: 'var(--muted)' }}>Production model</dt><dd className="num">claude-sonnet-5-5 via Node service, temperature 0</dd>
              <dt style={{ color: 'var(--muted)' }}>Calls this session</dt><dd className="num">{ctx?.aiCalls ?? 0}</dd>
              <dt style={{ color: 'var(--muted)' }}>Est. tokens</dt><dd className="num">{(ctx?.aiTokens ?? 0).toLocaleString()}</dd>
            </dl>
            <p className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>Email content is untrusted. The AI only classifies into a strict schema; code decides and validates. Instruction-like text is stripped and flagged.</p>
          </Section>
          <Section title="Safety & demo">
            <Toggle label="Redact phone numbers and IBANs before AI" on={settings.redactPii} disabled={!admin} onChange={(v) => save({ redactPii: v })} />
            <Toggle label="Simulate AI outage (degraded mode)" on={settings.aiOutage} disabled={!admin} onChange={(v) => save({ aiOutage: v })} hint="Next ingestion: emails go to the queue as AI_UNAVAILABLE; system events still commit." />
            <button className="btn mt-3" disabled={!admin} onClick={() => reset()}><RotateCcw size={15} />Reset demo</button>
          </Section>
        </div>
      )}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 py-2.5" style={{ borderTop: '1px solid var(--line)' }}><div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{label}</div>{hint && <div className="text-[12px]" style={{ color: 'var(--muted)' }}>{hint}</div>}</div>{children}</div>;
}
function Toggle({ label, on, onChange, disabled, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex-1"><div className="text-[13px] font-medium">{label}</div>{hint && <div className="text-[12px]" style={{ color: 'var(--muted)' }}>{hint}</div>}</div>
      <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className="relative h-6 w-11 rounded-full transition-colors disabled:opacity-50" style={{ background: on ? 'var(--teal)' : 'var(--line-strong)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
      </button>
    </div>
  );
}
