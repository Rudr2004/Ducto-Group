import { sha256 } from './sha256';
import type { Party, SourceDoc } from '@/pipeline/types';

let up = 0;
const party = (s = ''): Party => { const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/); return m ? { name: m[1].trim(), email: m[2].trim().toLowerCase() } : { name: s.trim(), email: s.trim().toLowerCase() }; };
const list = (s = '') => s.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim()).filter(Boolean).map(party);

function decodeBody(body: string, enc = '') {
  if (/quoted-printable/i.test(enc)) return body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (/base64/i.test(enc)) { try { return new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s/g, '')), (c) => c.charCodeAt(0))); } catch { return body; } }
  return body;
}

/** Plain-text RFC 822 parser (headers, first text/plain part, attachment names). Full MIME + .msg run in the Node service. */
export function parseEml(raw: string, fileName: string): SourceDoc {
  const split = raw.search(/\r?\n\r?\n/);
  if (split < 0) throw new Error(`${fileName}: no header/body separator`);
  const head = raw.slice(0, split).replace(/\r?\n[ \t]+/g, ' ');
  const headers: Record<string, string> = {};
  head.split(/\r?\n/).forEach((l) => { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); });
  if (!headers.from && !headers.subject) throw new Error(`${fileName}: not an email (no From or Subject header)`);
  let body = raw.slice(split).trim();
  const attachments: SourceDoc['attachments'] = [];
  const boundary = headers['content-type']?.match(/boundary="?([^";]+)"?/i)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`).slice(1);
    let text = '';
    for (const p of parts) {
      const s = p.search(/\r?\n\r?\n/); if (s < 0) continue;
      const ph = p.slice(0, s).toLowerCase(); const pb = p.slice(s).trim();
      const name = ph.match(/(?:file)?name="?([^";\r\n]+)"?/i)?.[1];
      if (name) attachments.push({ name, size: pb.length });
      else if (ph.includes('text/plain') && !text) text = decodeBody(pb, ph.match(/content-transfer-encoding:\s*(\S+)/)?.[1]);
    }
    body = text;
  } else body = decodeBody(body, headers['content-transfer-encoding']);
  const date = headers.date ? new Date(headers.date) : null;
  const id = `u${String(++up).padStart(4, '0')}`;
  return {
    id, kind: 'email', fileName, hash: sha256(raw), messageId: headers['message-id'], inReplyTo: headers['in-reply-to'], references: (headers.references ?? '').split(/\s+/).filter(Boolean),
    from: party(headers.from), to: list(headers.to), cc: list(headers.cc), mailboxes: ['upload'], sentAt: date && !isNaN(+date) ? date.toISOString() : null,
    receivedAt: new Date().toISOString(), subject: headers.subject ?? '', body, attachments,
    headers: Object.fromEntries(Object.entries(headers).filter(([k]) => ['auto-submitted', 'x-autoreply', 'x-autorespond'].includes(k))),
  };
}

export function parseEventFile(text: string, fileName: string): SourceDoc[] {
  const mk = (kind: SourceDoc['kind'], system: SourceDoc['system'], at: string, subject: string): SourceDoc => ({
    id: `u${String(++up).padStart(4, '0')}`, kind, fileName, hash: sha256(fileName + JSON.stringify(system) + at), from: { name: 'upload', email: 'upload@local' }, to: [], cc: [], mailboxes: [],
    sentAt: at, receivedAt: at, subject, body: '', attachments: [], headers: {}, system,
  });
  if (fileName.toLowerCase().endsWith('.csv')) {
    const [h, ...rows] = text.trim().split(/\r?\n/);
    const cols = h.split(',').map((c) => c.trim().toLowerCase());
    return rows.map((r) => { const v = r.split(','); const g = (k: string) => v[cols.indexOf(k)]?.trim() ?? '';
      return mk('obt', { obtRef: g('obt_ref'), packageName: g('package_name'), standardRef: g('standard_ref'), status: g('status') || 'Submitted' }, new Date(g('submitted_at')).toISOString(), `OBT ${g('obt_ref')}`); });
  }
  const arr = JSON.parse(text) as Record<string, string>[];
  if (!Array.isArray(arr)) throw new Error(`${fileName}: expected a JSON array of events`);
  return arr.map((e) => e.envelope_id
    ? mk('docusign', { envelopeId: e.envelope_id, docType: e.document_type as 'TRF', status: e.status, packageName: e.package_name ?? e.subject?.split('–').pop()?.trim() }, e.at, e.subject ?? 'DocuSign')
    : mk('sharepoint', { eventType: e.type, path: e.path, packageName: e.package_hint }, e.at, `${e.type} ${e.path}`));
}
