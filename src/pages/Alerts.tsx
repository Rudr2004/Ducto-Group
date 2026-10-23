import { useMemo, useState } from 'react';
import { BellRing, Send, Siren, Mail, CheckCheck } from 'lucide-react';
import { useStore } from '@/store/store';
import { useAlerts, type AlertItem } from '@/lib/hooks';
import { MILESTONES } from '@/domain/milestones';
import { fmt } from '@/domain/dates';
import { Empty, PageHeader, Section, Segmented } from '@/components/ui';

const SEV = { critical: { c: 'var(--over)', bg: 'var(--over-bg)', label: 'Critical' }, high: { c: 'var(--late)', bg: 'var(--late-bg)', label: 'High' }, normal: { c: 'var(--up)', bg: 'var(--up-bg)', label: 'Normal' } };

export default function Alerts() {
  const alerts = useAlerts();
  const { alertAcks, ackAlert, asOf, settings, sendDigest, digestsSent, openPkg, toast, role } = useStore();
  const [tab, setTab] = useState<'list' | 'digest'>('list');
  const [type, setType] = useState('');
  const shown = alerts.filter((a) => !type || a.type === type);
  const digest = alerts.filter((a) => !a.immediate);
  const types = [...new Set(alerts.map((a) => a.type))];
  const html = useMemo(() => digestHtml(digest, alerts.filter((a) => a.immediate), asOf), [digest, alerts, asOf]);

  return (
    <div>
      <PageHeader title="Alerts" desc={`Email to Jassim: one daily digest at ${String(settings.digestHour).padStart(2, '0')}:00 Dubai, immediate email only for critical events. Same condition never alerts twice.`}
        actions={<Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'list', label: `Alerts (${alerts.length})` }, { value: 'digest', label: 'Digest email preview' }]} />} />
      {tab === 'list' ? (
        alerts.length === 0 ? <div className="card"><Empty icon={<BellRing size={20} />} title="No alerts as of this date" body="Move the as-of date forward in the top bar to see due-soon, overdue and escalation alerts appear." /></div> : (
          <Section pad={false} title={<span className="flex items-center gap-2">{shown.length} alerts <select className="input h-7 text-[12px]" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by rule"><option value="">All rules</option>{types.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</option>)}</select></span>}
            right={<button className="btn btn-sm" onClick={() => alerts.forEach((a) => ackAlert(a.key))}><CheckCheck size={14} />Mark all read</button>}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[12px]" style={{ color: 'var(--muted)' }}><th className="font-medium px-4 py-2">Severity</th><th className="font-medium py-2">Alert</th><th className="font-medium py-2">Package</th><th className="font-medium py-2">Milestone</th><th className="font-medium py-2">Rule</th><th className="font-medium py-2 pr-4">Delivery</th></tr></thead>
                <tbody>
                  {shown.slice(0, 200).map((a) => (
                    <tr key={a.key} className="hover:bg-[var(--sunken)] cursor-pointer" style={{ borderTop: '1px solid var(--line)', fontWeight: alertAcks.includes(a.key) ? 400 : 500 }} onClick={() => { ackAlert(a.key); if (a.pkgId) openPkg(a.pkgId); }}>
                      <td className="px-4 py-2"><span className="inline-flex items-center gap-1 text-[11.5px] rounded px-1.5 py-0.5 font-semibold" style={{ color: SEV[a.severity].c, background: SEV[a.severity].bg }}>{a.severity === 'critical' && <Siren size={11} />}{SEV[a.severity].label}</span></td>
                      <td className="py-2"><div>{a.title}</div><div className="text-[11.5px] font-normal truncate max-w-[340px]" style={{ color: 'var(--muted)' }} dir="auto">{a.detail}</div></td>
                      <td className="py-2 max-w-[200px] truncate">{a.pkgName ?? '—'}</td>
                      <td className="py-2">{a.milestone ? MILESTONES.find((m) => m.key === a.milestone)?.short : '—'}</td>
                      <td className="py-2 text-[12px]" style={{ color: 'var(--muted)' }}>{a.type.replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="py-2 pr-4 text-[12px]" style={{ color: 'var(--muted)' }}>{a.immediate ? 'Immediate email' : digestsSent.length ? 'In digest' : 'Next digest'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )
      ) : (
        <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 text-[12.5px] flex items-center gap-2" style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}><Mail size={14} />To: jassim@dutco.ae · Subject: Procurement Control Tower — daily digest · {fmt(asOf)}</div>
            <iframe title="Digest email preview" sandbox="" srcDoc={html} className="w-full h-[640px] bg-white" />
          </div>
          <Section title="Delivery">
            <p className="text-[12.5px] mb-3" style={{ color: 'var(--muted)' }}>In the POC, the Node service sends this HTML through SMTP to Mailpit (docker). Teams delivery is Stage 2.</p>
            <button className="btn btn-primary w-full justify-center" disabled={role !== 'admin'} onClick={() => { sendDigest(digest.length); toast({ tone: 'ok', title: 'Digest queued for delivery', body: `${digest.length} items · open Mailpit at localhost:8025 when running the server` }); }}><Send size={15} />Send digest now</button>
            <ul className="mt-3 text-[12px] flex flex-col gap-1" style={{ color: 'var(--muted)' }}>{digestsSent.slice(-5).reverse().map((d) => <li key={d.at}>Sent {new Date(d.at).toLocaleString()} · {d.count} items</li>)}</ul>
          </Section>
        </div>
      )}
    </div>
  );
}

function digestHtml(items: AlertItem[], critical: AlertItem[], asOf: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const color = { critical: '#DC2626', high: '#EA580C', normal: '#64748B' };
  const row = (a: AlertItem) => `<tr><td style="padding:8px 10px;border-top:1px solid #E1E6EE"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;color:${color[a.severity]};background:${color[a.severity]}1a">${a.severity}</span></td><td style="padding:8px 10px;border-top:1px solid #E1E6EE"><b>${esc(a.title)}</b><br><span style="color:#5B6B80;font-size:12px">${esc(a.pkgName ?? '')}</span></td><td style="padding:8px 10px;border-top:1px solid #E1E6EE;text-align:right"><a href="#" style="color:#0E9F8E;font-size:12px">Open</a></td></tr>`;
  const counts = (t: string) => items.filter((a) => a.type === t).length;
  return `<!doctype html><html><body style="margin:0;background:#F3F5F8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0E1B2C">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F2A4A;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px"><div style="font-size:12px;opacity:.7">Procurement Control Tower · Dutco Group</div><div style="font-size:20px;font-weight:600;margin-top:4px">Daily digest — ${asOf}</div></div>
  <div style="background:#fff;border:1px solid #E1E6EE;border-top:0;border-radius:0 0 12px 12px;padding:20px 24px">
  <table width="100%" style="border-collapse:collapse;margin-bottom:16px"><tr>
  ${[['Overdue', counts('OVERDUE') + counts('ESCALATION'), '#DC2626'], ['Due soon', counts('DUE_SOON'), '#D97706'], ['Slipping', counts('FORECAST_SLIP'), '#EA580C'], ['Exceptions', counts('NEW_EXCEPTION'), '#0E9F8E']].map(([l, n, c]) => `<td style="text-align:center;padding:10px;border:1px solid #E1E6EE"><div style="font-size:24px;font-weight:700;color:${c}">${n}</div><div style="font-size:12px;color:#5B6B80">${l}</div></td>`).join('')}
  </tr></table>
  ${critical.length ? `<p style="font-size:13px;color:#DC2626;margin:0 0 12px"><b>${critical.length} critical event(s)</b> were also emailed immediately.</p>` : ''}
  <table width="100%" style="border-collapse:collapse;font-size:13px">${items.slice(0, 25).map(row).join('')}</table>
  ${items.length > 25 ? `<p style="font-size:12px;color:#5B6B80">…and ${items.length - 25} more in the app.</p>` : ''}
  <p style="font-size:11px;color:#8B98AA;margin-top:20px">Dates are Asia/Dubai. Every date links to its evidence in the app. You receive this as the procurement administrator.</p>
  </div></div></body></html>`;
}
