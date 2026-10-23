import { Fragment, type ReactNode } from 'react';
import { Paperclip, FileSignature, FolderOpen, Landmark, Mail, AlertTriangle } from 'lucide-react';
import type { EvidenceEvent, SourceDoc } from '@/pipeline/types';
import { dubaiDate, dubaiTime, fmt } from '@/domain/dates';
import { stripQuoted } from '@/pipeline/match';

export const KIND_ICON = { email: Mail, sharepoint: FolderOpen, docusign: FileSignature, obt: Landmark } as const;

function highlight(text: string, cues: string[]): ReactNode {
  const terms = cues.filter((c) => c.length > 2).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded px-0.5" style={{ background: 'color-mix(in srgb, var(--teal) 22%, transparent)', color: 'inherit' }}>{part}</mark> : <Fragment key={i}>{part}</Fragment>));
}

export function SourceViewer({ doc, event }: { doc: SourceDoc; event?: EvidenceEvent }) {
  const Icon = KIND_ICON[doc.kind];
  const when = doc.sentAt ?? doc.receivedAt;
  if (doc.kind !== 'email') {
    return (
      <div className="text-[13px]">
        <div className="flex items-center gap-2 mb-3"><Icon size={16} style={{ color: 'var(--teal)' }} /><b>{doc.kind === 'obt' ? 'OBT export row' : doc.kind === 'docusign' ? 'DocuSign event' : 'SharePoint event'}</b><span className="text-[12px]" style={{ color: 'var(--muted)' }}>· simulated Stage 1 source ({doc.fileName})</span></div>
        <pre className="text-[12px] p-3 rounded-lg overflow-x-auto" style={{ background: 'var(--sunken)' }}>{JSON.stringify({ ...doc.system, at: when, dubai_date: dubaiDate(when) }, null, 2)}</pre>
      </div>
    );
  }
  const fresh = stripQuoted(doc.body);
  const quoted = doc.body.slice(fresh.length).trim() && doc.body.length > fresh.length ? doc.body.slice(doc.body.indexOf(fresh) + fresh.length).trim() : '';
  return (
    <div className="text-[13px]">
      <div className="text-[15px] font-semibold mb-2" dir="auto">{doc.subject || <span style={{ color: 'var(--faint)' }}>(no subject)</span>}</div>
      <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-[12.5px] mb-3">
        <dt style={{ color: 'var(--muted)' }}>From</dt><dd className="truncate">{doc.from.name} &lt;{doc.from.email}&gt;</dd>
        <dt style={{ color: 'var(--muted)' }}>To</dt><dd className="truncate">{doc.to.map((t) => t.email).join(', ') || '—'}</dd>
        {doc.cc.length > 0 && <><dt style={{ color: 'var(--muted)' }}>Cc</dt><dd className="truncate">{doc.cc.map((t) => t.email).join(', ')}</dd></>}
        <dt style={{ color: 'var(--muted)' }}>Sent</dt><dd className="num">{doc.sentAt ? <>{fmt(dubaiDate(doc.sentAt))} {dubaiTime(doc.sentAt)} Dubai <span style={{ color: 'var(--faint)' }}>({doc.sentAt.slice(11, 16)} UTC)</span></> : <span style={{ color: 'var(--soon)' }} className="inline-flex items-center gap-1"><AlertTriangle size={12} />No Date header — received {fmt(dubaiDate(doc.receivedAt))} used</span>}</dd>
        <dt style={{ color: 'var(--muted)' }}>Mailboxes</dt><dd className="truncate">{doc.mailboxes.join(', ')}</dd>
      </dl>
      {doc.html ? (
        <iframe title="Email HTML (sandboxed)" sandbox="" srcDoc={doc.html} className="w-full h-64 rounded-lg" style={{ border: '1px solid var(--line)', background: '#fff' }} />
      ) : (
        <div className="rounded-lg p-3.5 whitespace-pre-wrap leading-relaxed text-[13px]" dir="auto" style={{ background: 'var(--sunken)', unicodeBidi: 'plaintext' }}>
          {fresh ? highlight(fresh, event?.cues ?? []) : <span style={{ color: 'var(--faint)' }}>(empty body — attachment-only email)</span>}
          {quoted && <div className="mt-3 pt-3 text-[12px]" style={{ borderTop: '1px dashed var(--line-strong)', color: 'var(--faint)' }}><div className="font-medium mb-1">Quoted history — not classified</div>{quoted}</div>}
        </div>
      )}
      {doc.attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">{doc.attachments.map((a) => <li key={a.name} className="inline-flex items-center gap-1.5 text-[12px] rounded-md px-2 py-1" style={{ border: '1px solid var(--line)' }}><Paperclip size={12} />{a.name}<span className="num" style={{ color: 'var(--faint)' }}>{Math.round(a.size / 1024)} KB</span></li>)}</ul>
      )}
    </div>
  );
}
