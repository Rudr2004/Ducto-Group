import { dubaiDate, diffDays, parseUaeDate, type ISODate } from '@/domain/dates';
import { MILESTONES, type MilestoneKey } from '@/domain/milestones';
import type { Package } from '@/domain/types';
import { sha256 } from '@/lib/sha256';
import type { AiView, Candidate, EvidenceEvent, ReasonCode, SourceDoc } from './types';

export interface MatchSettings {
  autoCommitThreshold: number; queueFloor: number; aiAvailable: boolean; redactPii: boolean;
  internalDomains: string[]; projectTeam: string[]; tokenBudgetChars: number;
}
export interface MatchContext {
  packages: Package[]; bidders: Record<string, string[]>; supplierDomains: Record<string, string>;
  learned: Record<string, string>; // supplier → pkgId (learned from admin decisions, per round)
  seenHashes: Set<string>; seenMessageIds: Map<string, string>; nearDup: Map<string, { docId: string; t: number }>;
  threads: Map<string, string>; envelopes: Map<string, string>; obtRefs: Map<string, string>;
  rounds: Record<string, number>; bidTabRound: Record<string, number>;
  events: EvidenceEvent[]; aiCalls: number; aiTokens: number;
}

export function newContext(packages: Package[], bidders: Record<string, string[]>, supplierDomains: Record<string, string>): MatchContext {
  return {
    packages, bidders, supplierDomains, learned: {}, seenHashes: new Set(), seenMessageIds: new Map(), nearDup: new Map(),
    threads: new Map(), envelopes: new Map(), obtRefs: new Map(), rounds: {}, bidTabRound: {}, events: [], aiCalls: 0, aiTokens: 0,
  };
}

// ---------- normalisation helpers (pure, unit-tested)
export const normText = (s: string) => s.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
export const normSubject = (s: string) => s.replace(/^\s*((re|fw|fwd|aw|tr)\s*:\s*|\[external\]\s*)+/gi, '').trim().toLowerCase();

/** E1: keep only the new content of a reply/forward. */
export function stripQuoted(body: string): string {
  const cut = [/^-{3,}\s*Original Message\s*-{3,}/im, /^From:\s.*\n(Sent|Date):\s/im, /^On .{5,80} wrote:\s*$/im, /^_{10,}\s*$/m];
  let end = body.length;
  for (const re of cut) { const m = body.match(re); if (m && m.index !== undefined && m.index < end) end = m.index; }
  return body.slice(0, end).split('\n').filter((l) => !l.trimStart().startsWith('>')).join('\n').trim();
}

/** E8: ref code variants D-0729, d 0729, D0729-01 → D0729 */
export function parseRefs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<![A-Za-z0-9])([A-Ga-g])[\s-]?(\d{4})(?:-\d{1,2})?(?![0-9])/g)) out.add(`${m[1].toUpperCase()}${m[2]}`);
  return [...out];
}

export function isNoise(d: SourceDoc): string | null {
  const h = Object.fromEntries(Object.entries(d.headers).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  if (h['auto-submitted'] && h['auto-submitted'] !== 'no') return 'Auto-reply (Auto-Submitted header)';
  if (h['x-autoreply'] || h['x-autorespond']) return 'Auto-reply header';
  const s = d.subject.toLowerCase();
  if (/^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office)/.test(s)) return 'Out-of-office reply';
  if (/^(undeliverable|delivery status notification|mail delivery failed|returned mail)/.test(s) || /^(postmaster|mailer-daemon)@/.test(d.from.email)) return 'Delivery failure (NDR)';
  if (/^read:/.test(s)) return 'Read receipt';
  if (/^(invitation|accepted|declined|tentative|updated invitation):/.test(s) || /BEGIN:VCALENDAR/.test(d.body)) return 'Calendar invite';
  return null;
}

const edit1 = (a: string, b: string) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
};

interface NameHit { pkgId: string; exact: boolean; instance: boolean; start: number; len: number }
/** E4/E6/E9: find package names incl. instance suffix; longest match wins; fuzzy with edit distance 1 for words ≥ 5 chars. */
export function findPackages(text: string, packages: Package[]): NameHit[] {
  const t = normText(text);
  const words = t.split(' ');
  const hits: NameHit[] = [];
  for (const p of packages) {
    const instM = p.name.match(/\((\d)\)\s*$|#(\d)\s*$/);
    const inst = instM ? instM[1] ?? instM[2] : null;
    const base = normText(inst ? p.name.replace(/\s*\(\d\)\s*$|\s*-?\s*#\d\s*$/, '') : p.name).split(' ');
    for (let i = 0; i + base.length <= words.length; i++) {
      let exact = true, ok = true;
      for (let k = 0; k < base.length; k++) {
        const w = words[i + k], b = base[k];
        if (w === b) continue;
        if (b.length >= 5 && edit1(w, b)) { exact = false; continue; }
        ok = false; break;
      }
      if (!ok) continue;
      let len = base.length, instance = false;
      if (inst) {
        const after = words.slice(i + base.length, i + base.length + 2);
        if (after[0] === inst) { instance = true; len++; } else if (after[0] === 'package' && after[1] === inst) { instance = true; len += 2; }
        else if (/^\d$/.test(after[0] ?? '') || (after[0] === 'package' && /^\d$/.test(after[1] ?? ''))) continue; // other instance
      }
      hits.push({ pkgId: p.id, exact, instance, start: i, len });
    }
  }
  // drop hits contained in a longer hit (e.g. "Precast" inside "Precast Boundary Wall")
  return hits.filter((h) => !hits.some((o) => o !== h && o.len > h.len && o.start <= h.start && o.start + o.len >= h.start + h.len));
}

/** Clauses about the future ("bid tab to follow", "will share tomorrow") are announcements, not events. */
const FUTURE = /\b(to follow|will (be )?(send|share|issue|follow|circulate|submit)\w*|shortly|in due course|next week|tomorrow|pending)\b/i;
export const assertive = (text: string) => text.split(/(?<=[.;!?\n])|,\s+(?=and |but )/).filter((c) => !FUTURE.test(c)).join('');

const INJECTION = /(ignore (all )?(previous|prior) instructions|disregard (the )?(above|previous)|you are now|system prompt|mark (this|the)? ?(package|item)? ?as (approved|awarded))/i;
export function redactPii(s: string) {
  return s.replace(/\+?971[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}/g, '[phone]').replace(/\bAE\d{2}[ ]?(\d{4}[ ]?){4}\d{3}\b/g, '[iban]');
}

type Role = AiView['role'];
const cuesFor: { key: MilestoneKey; re: RegExp; role: (r: Role, projectTeam: boolean) => boolean }[] = [
  { key: 'dtp_received', re: /(detail tender package|\bdtp\b)/i, role: (_r, pt) => pt },
  { key: 'provide_link_to_stp', re: /(\bstp\b|standard tender package).*(link|sharepoint)|link to stp/is, role: (r) => r === 'internal' },
  { key: 'float_rfps', re: /(rfps? (have been |were )?floated)/i, role: (r) => r === 'internal' },
  { key: 'float_rfps', re: /(request for proposal|\brfp\b|invites? you to submit)/i, role: (r) => r === 'sent_by_procurement' },
  { key: 'tqs_closed', re: /(tqs? (are )?(now )?closed|all (technical )?queries.*closed|responses to all technical queries)/i, role: (r) => r !== 'received_from_supplier' },
  { key: 'tq_process', re: /(technical quer(y|ies)|\btqs?\b)/i, role: (r) => r === 'received_from_supplier' },
  { key: 'final_bid_tab', re: /(final bid ?tab)/i, role: (r) => r === 'internal' },
  { key: 'initial_bid_tab', re: /(bid ?tab|bid tabulation|comparison sheet)/i, role: (r) => r === 'internal' },
  { key: 'ptc_process', re: /(post tender clarification|\bptcs?\b)/i, role: (r) => r === 'sent_by_procurement' },
  { key: 'ptc_closed', re: /(\bptcs?\b|post tender clarification)/i, role: (r) => r === 'received_from_supplier' },
  { key: 'lafo_proposal_received', re: /(\blafo\b|last and final|final offer|\bbafo\b)/i, role: (r) => r === 'received_from_supplier' },
  { key: 'initial_proposals_received', re: /(proposal|quotation|our offer|revised offer|submission)/i, role: (r) => r === 'received_from_supplier' },
  { key: 'initial_proposals_received', re: /all proposals (are in|received)/i, role: (r) => r === 'internal' },
  { key: 'award_issued', re: /(letter of award|\bloa\b|\blpo\b|purchase order)/i, role: (r) => r === 'sent_by_procurement' },
];

/** Simulated Claude classifier (used when no API key / offline demo). Reads the body first, the way a person would. */
export function simulatedAi(input: { text: string; subject: string; attachments: string[]; role: Role; candidates: Candidate[]; namedPkgs: string[]; threadPkg: string | null; uniqueBidderPkg: string | null; supplier: string | null }): AiView {
  const body = input.text.toLowerCase();
  const att = input.attachments.join(' ').toLowerCase();
  let milestone: AiView['milestone'] = 'none', mc = 0.0, why = '';
  const say = (k: MilestoneKey, c: number, w: string) => { if (milestone === 'none') { milestone = k; mc = c; why = w; } };
  const r = input.role;
  if (/thank(s| you)[^.]*received|well received|we will revert|acknowledge/.test(body) && body.length < 220) { /* acknowledgement only */ }
  else {
    if (/sharepoint/.test(body) && /(detail tender package|dtp)/.test(body) && r === 'internal') say('dtp_received', 0.95, 'Project team shares the DTP SharePoint link with procurement.');
    if (/answers to the technical queries|resolved from our side/.test(body) && r === 'received_from_supplier') say('tq_process', 0.86, 'Supplier is answering technical queries, not post-tender clarifications.');
    if (/(signed )?ptc responses|responses to (the )?ptc/.test(body + att) && r === 'received_from_supplier') say('ptc_closed', 0.94, 'Supplier returns signed PTC responses.');
    if (/(last and final|lafo)/.test(body + att) && r === 'received_from_supplier') say('lafo_proposal_received', 0.95, 'Supplier submits its last and final offer.');
    if (/(technical queries|\btq\b)/.test(body + att) && r === 'received_from_supplier') say('tq_process', 0.93, 'Supplier raises technical queries during tender.');
    if (/(proposal|quotation|offer)/.test(body + att) && r === 'received_from_supplier' && !/validity is extended/.test(body)) say('initial_proposals_received', 0.93, 'Supplier submits a proposal in response to the RFP.');
    if (/validity is extended|revised offer/.test(body) && r === 'received_from_supplier') say('initial_proposals_received', 0.72, 'Supplier sends a revised offer; tender round unclear.');
    if (/عرض/.test(input.text) && r === 'received_from_supplier') say('initial_proposals_received', 0.92, 'Arabic proposal submission from a bidder.');
    if (/(invite[sd]? (you )?to submit|request for proposal|revised proposals)/.test(body) && r === 'sent_by_procurement') say('float_rfps', 0.95, 'Procurement invites external bidders to tender.');
    if (/rfps? .*floated/.test(body) && r === 'internal') say('float_rfps', 0.92, 'Internal note confirms RFPs were floated.');
    if (/all (technical )?queries|tqs are now closed/.test(body) && r !== 'received_from_supplier') say('tqs_closed', 0.94, 'Procurement closes all TQs.');
    if (/standard tender package|link to stp/.test(body)) say('provide_link_to_stp', 0.93, 'Procurement shares the STP link.');
    if (/final bid tab/.test(body + att) && r === 'internal') say('final_bid_tab', 0.95, 'Final bid tabulation circulated internally.');
    if (/(bid tab|bid tabulation)/.test(body + att) && r === 'internal') say('initial_bid_tab', 0.94, 'Initial bid tabulation circulated for review.');
    if (/post tender clarification/.test(body) && r === 'sent_by_procurement') say('ptc_process', 0.94, 'Procurement issues PTCs to shortlisted bidders.');
    if (/letter of award|\bloa\b/.test(body + att) && r === 'sent_by_procurement') say('award_issued', 0.96, 'Award letter issued to the vendor.');
    if (/all proposals are in/.test(body) && r === 'internal') say('initial_proposals_received', 0.8, 'Internal confirmation that proposals are in.');
  }
  // package choice: explicit mention > thread > unique bidder set > top candidate if clearly ahead
  let pkgId: string | null = null, pc = 0;
  if (input.namedPkgs.length === 1) { pkgId = input.namedPkgs[0]; pc = 0.95; }
  else if (input.namedPkgs.length > 1) { pkgId = input.namedPkgs[0]; pc = 0.6; }
  else if (input.threadPkg) { pkgId = input.threadPkg; pc = 0.92; }
  else if (input.uniqueBidderPkg) { pkgId = input.uniqueBidderPkg; pc = 0.88; }
  else if (input.candidates[0]) { pkgId = input.candidates[0].pkgId; pc = input.candidates.length > 1 ? 0.45 : 0.7; }
  return {
    isProcurementEvent: milestone !== 'none', pkgId, pkgConfidence: pc, milestone, milestoneConfidence: mc, role: r, supplier: input.supplier,
    rationale: milestone === 'none' ? 'No procurement milestone in the new content.' : why, provider: 'simulated',
    explicitDates: [...input.text.matchAll(/(closing|deadline|due) on (\d{1,2}\/\d{1,2}\/\d{4})/gi)].map((m) => {
      const p = parseUaeDate(m[2])!; return { type: 'tender_closing', date: p.date, ambiguous: p.ambiguous };
    }),
  };
}

let evSeq = 0;
const mkEvent = (doc: SourceDoc, partial: Partial<EvidenceEvent>): EvidenceEvent => ({
  id: `ev${String(++evSeq).padStart(5, '0')}`, docId: doc.id, pkgId: null, key: null, round: 1, date: null, decision: 'IGNORED',
  confidence: 0, ruleHits: [], candidates: [], ruleMilestone: null, flags: [], cues: [], newContent: '', ...partial,
});
export const resetEventSeq = () => { evSeq = 0; };
export const getEventSeq = () => evSeq;
export const setEventSeq = (n: number) => { evSeq = n; };

const byName = (ctx: MatchContext, name?: string) => ctx.packages.filter((p) => normText(p.name) === normText(name ?? ''));

function roundFor(ctx: MatchContext, pkgId: string, key: MilestoneKey): number {
  const idx = MILESTONES.findIndex((m) => m.key === key);
  if (idx < 3) return 1;
  const cur = ctx.rounds[pkgId] ?? 1;
  if (key === 'float_rfps' && ctx.bidTabRound[pkgId] === cur) { ctx.rounds[pkgId] = cur + 1; return cur + 1; }
  if (key === 'initial_bid_tab') ctx.bidTabRound[pkgId] = cur;
  return cur;
}

function validate(ctx: MatchContext, ev: EvidenceEvent): ReasonCode | null {
  const p = ctx.packages.find((x) => x.id === ev.pkgId);
  if (!p || !ev.date) return null;
  if (p.dateAdded && ev.date < p.dateAdded) {
    if (diffDays(p.dateAdded, ev.date) > 365) return 'OUT_OF_WINDOW';
    ev.flags.push('BEFORE_DATE_ADDED');
  }
  return null;
}

/** Process one document → zero, one or two evidence events. Never throws: failures become ERROR events (E20). */
export function processDoc(doc: SourceDoc, ctx: MatchContext, s: MatchSettings): EvidenceEvent[] {
  try { return processInner(doc, ctx, s); }
  catch (e) { return [mkEvent(doc, { decision: 'ERROR', ignoredReason: `Could not process: ${(e as Error).message}` })]; }
}

function processInner(doc: SourceDoc, ctx: MatchContext, s: MatchSettings): EvidenceEvent[] {
  if (doc.corrupt) throw new Error(`${doc.fileName} is not a valid Outlook message (corrupted or unsupported).`);
  if (ctx.seenHashes.has(doc.hash)) return [mkEvent(doc, { decision: 'DUPLICATE', ignoredReason: 'File already ingested (same SHA-256) — idempotent re-ingest' })];
  ctx.seenHashes.add(doc.hash);
  if (doc.messageId && ctx.seenMessageIds.has(doc.messageId)) {
    return [mkEvent(doc, { decision: 'DUPLICATE', ignoredReason: `Same Message-ID already ingested from another mailbox (${doc.mailboxes.join(', ')})`, flags: [`DUP_OF:${ctx.seenMessageIds.get(doc.messageId)}`] })];
  }
  if (doc.messageId) ctx.seenMessageIds.set(doc.messageId, doc.id);
  const when = doc.sentAt ?? doc.receivedAt;

  if (doc.kind === 'email') {
    const nk = `${normSubject(doc.subject)}|${doc.from.email}|${sha256(stripQuoted(doc.body))}`;
    const prev = ctx.nearDup.get(nk);
    if (prev && Math.abs(Date.parse(when) - prev.t) <= 120_000) return [mkEvent(doc, { decision: 'DUPLICATE', ignoredReason: 'Near-duplicate resend (same subject, sender and body within 2 minutes)', flags: [`DUP_OF:${prev.docId}`] })];
    ctx.nearDup.set(nk, { docId: doc.id, t: Date.parse(when) });
    const noise = isNoise(doc);
    if (noise) return [mkEvent(doc, { decision: 'IGNORED', ignoredReason: noise })];
    return processEmail(doc, ctx, s);
  }
  return processSystem(doc, ctx, s);
}

function processSystem(doc: SourceDoc, ctx: MatchContext, _s: MatchSettings): EvidenceEvent[] {
  const sys = doc.system!;
  const date = dubaiDate(doc.sentAt ?? doc.receivedAt);
  const matches = byName(ctx, sys.packageName);
  const p = matches.length === 1 ? matches[0] : matches.find((x) => x.ref === sys.standardRef) ?? null;
  const base = { pkgId: p?.id ?? null, date, confidence: p ? 0.99 : 0.4, ruleHits: p ? ['SYSTEM_ID', 'PACKAGE_NAME_EXACT'] : [], candidates: p ? [{ pkgId: p.id, score: 0.99, anchors: ['SYSTEM'] }] : [], newContent: doc.subject };
  if (!p) return [mkEvent(doc, { ...base, decision: 'QUEUED', reason: 'NO_ANCHOR' })];
  const commit = (key: MilestoneKey | 'trf_approved' | 'obt_approved', extra: Partial<EvidenceEvent> = {}) => {
    const round = key === 'trf_approved' || key === 'obt_approved' ? ctx.rounds[p.id] ?? 1 : roundFor(ctx, p.id, key);
    return [mkEvent(doc, { ...base, key, round, ruleMilestone: key.endsWith('approved') ? null : (key as MilestoneKey), decision: 'AUTO_COMMITTED', ...extra })];
  };
  if (doc.kind === 'sharepoint') return commit(sys.eventType === 'folder_created' ? 'stp_created' : 'provide_link_to_stp');
  if (doc.kind === 'docusign') {
    ctx.envelopes.set(sys.envelopeId!, p.id);
    if (sys.status === 'declined' || sys.status === 'voided') {
      ctx.events.filter((e) => e.pkgId === p.id && e.flags.includes(`ENV:${sys.envelopeId}`)).forEach((e) => { e.invalidated = true; });
      return [mkEvent(doc, { ...base, decision: 'QUEUED', reason: 'DOCUSIGN_DECLINED', flags: ['CRITICAL', `ENV:${sys.envelopeId}`] })];
    }
    if (sys.docType === 'TRF') {
      if (sys.status === 'sent') return commit('trf_created', { flags: [`ENV:${sys.envelopeId}`] });
      if (sys.status === 'completed') return commit('trf_approved', { flags: [`ENV:${sys.envelopeId}`] });
    } else if (sys.status === 'completed') return commit('award_issued', { flags: [`ENV:${sys.envelopeId}`] });
    return [mkEvent(doc, { ...base, decision: 'IGNORED', ignoredReason: `DocuSign status "${sys.status}" sets no milestone` })];
  }
  // OBT (S3, S4)
  const ref = (sys.obtRef ?? '').replace(/\s+/g, '').replace(/\.0$/, '');
  ctx.obtRefs.set(ref, p.id);
  const st = (sys.status ?? '').toLowerCase();
  if (st === 'returned' || st === 'rejected') {
    ctx.events.filter((e) => e.pkgId === p.id && e.key === 'uploaded_to_obt').forEach((e) => { e.flags.push('SUPERSEDED_BY_RESUBMISSION'); });
    return [mkEvent(doc, { ...base, decision: 'QUEUED', reason: 'OBT_RETURNED', flags: ['CRITICAL', `OBT:${ref}`] })];
  }
  if (st === 'approved') return commit('obt_approved', { flags: [`OBT:${ref}`] });
  return commit('uploaded_to_obt', { flags: [`OBT:${ref}`] });
}

function processEmail(doc: SourceDoc, ctx: MatchContext, s: MatchSettings): EvidenceEvent[] {
  const isReply = /^\s*(re|fw|fwd|aw|tr)\s*:/i.test(doc.subject);
  let newContent = stripQuoted(doc.body);
  const flags: string[] = [];
  if (doc.body.length > s.tokenBudgetChars) { newContent = newContent.slice(0, s.tokenBudgetChars); flags.push('TRUNCATED_FOR_AI'); }
  if (INJECTION.test(newContent)) flags.push('PROMPT_INJECTION');
  const safeContent = newContent.split('\n').filter((l) => !INJECTION.test(l)).join('\n');
  const attNames = doc.attachments.map((a) => a.name);
  const bodyCueText = [assertive(safeContent), ...attNames].join('\n');
  const subjectCueText = isReply ? '' : assertive(doc.subject);
  const nameText = [doc.subject, safeContent, ...attNames].join('\n');

  const fromDomain = doc.from.email.split('@')[1] ?? '';
  const fromInternal = s.internalDomains.includes(fromDomain);
  const toExternal = doc.to.some((t) => !s.internalDomains.includes(t.email.split('@')[1] ?? ''));
  const role: Role = fromInternal ? (toExternal ? 'sent_by_procurement' : 'internal') : 'received_from_supplier';
  const projectTeam = s.projectTeam.includes(doc.from.email);
  const personal = /@(gmail|hotmail|outlook|yahoo|icloud)\./i.test(doc.from.email);
  if (personal) flags.push('PERSONAL_DOMAIN');

  // supplier identity
  let supplier: string | null = ctx.supplierDomains[fromDomain] ?? null;
  if (!supplier && personal) {
    const sigName = Object.values(ctx.supplierDomains).find((v) => new RegExp(`\\b${v.split(' ')[0]}\\b`, 'i').test(newContent + doc.from.name));
    supplier = sigName ?? null;
  }

  // ---- deterministic candidates
  const cand = new Map<string, Candidate>();
  const add = (pkgId: string, score: number, anchor: string) => {
    const c = cand.get(pkgId) ?? { pkgId, score: 0, anchors: [] };
    c.score = Math.max(c.score, score) + (c.anchors.length ? 0.02 : 0); c.anchors.push(anchor); cand.set(pkgId, c);
  };
  const ruleHits: string[] = [];
  const names = findPackages(nameText, ctx.packages);
  const named = new Set<string>();
  for (const h of names) {
    const p = ctx.packages.find((x) => x.id === h.pkgId)!;
    const hasSiblings = ctx.packages.some((x) => x.id !== p.id && normText(x.name.replace(/\s*\(\d\)|\s*-?\s*#\d/, '')) === normText(p.name.replace(/\s*\(\d\)|\s*-?\s*#\d/, '')));
    if (hasSiblings && !h.instance) { add(p.id, 0.45, 'NAME_NO_INSTANCE'); continue; }
    add(p.id, h.exact ? 0.95 : 0.9, h.exact ? 'NAME_EXACT' : 'NAME_FUZZY');
    named.add(p.id);
    ruleHits.push(`${h.exact ? 'Package name' : 'Fuzzy name'}: ${p.name}`);
  }
  for (const ref of parseRefs(nameText)) {
    const ps = ctx.packages.filter((p) => p.ref === ref);
    if (ps.length === 1) { add(ps[0].id, 0.93, 'REF_UNIQUE'); ruleHits.push(`Ref ${ref} → ${ps[0].name}`); }
    else ps.forEach((p) => add(p.id, 0.4, 'REF_SHARED'));
    if (ps.length > 1) ruleHits.push(`Ref ${ref} is shared by ${ps.length} packages`);
  }
  const threadPkg = (doc.inReplyTo && ctx.threads.get(doc.inReplyTo)) || (doc.references ?? []).map((r) => ctx.threads.get(r)).find(Boolean) || null;
  if (threadPkg) { add(threadPkg, 0.92, 'THREAD'); ruleHits.push(`Thread already linked to ${ctx.packages.find((p) => p.id === threadPkg)?.name}`); }
  let uniqueBidderPkg: string | null = null;
  if (supplier) {
    const learnedPkg = ctx.learned[supplier];
    const invited = Object.entries(ctx.bidders).filter(([, vs]) => vs.includes(supplier!)).map(([id]) => id);
    if (learnedPkg) { add(learnedPkg, 0.9, 'LEARNED_RULE'); ruleHits.push(`Learned rule: ${supplier} → ${ctx.packages.find((p) => p.id === learnedPkg)?.name}`); }
    if (invited.length === 1) { uniqueBidderPkg = invited[0]; add(invited[0], personal ? 0.7 : 0.88, 'BIDDER_UNIQUE'); ruleHits.push(`${supplier} is invited on one open package`); }
    else if (invited.length > 1) { invited.forEach((id) => add(id, 0.4, 'BIDDER_SHARED')); ruleHits.push(`${supplier} is invited on ${invited.length} open packages`); }
  }
  const candidates = [...cand.values()].sort((a, b) => b.score - a.score).slice(0, 5);

  // ---- rule milestone
  // Subject = the sender's declared intent; body = what actually happened. Both are read; conflicts surface to the AI check.
  const cueOf = (t: string) => cuesFor.find((c) => c.re.test(t) && c.role(role, projectTeam));
  const subjCue = subjectCueText ? cueOf(subjectCueText) : undefined;
  const bodyCue = cueOf(bodyCueText);
  const ruleCue = subjCue ?? bodyCue;
  const ruleMilestone: MilestoneKey | null = ruleCue?.key ?? null;
  const cueText = subjectCueText + '\n' + bodyCueText;
  if (ruleCue) ruleHits.push(`Cue “${(subjCue ? subjectCueText : bodyCueText).match(ruleCue.re)![0].trim().slice(0, 40)}” → ${MILESTONES.find((m) => m.key === ruleCue.key)!.name}`);
  if (subjCue && bodyCue && subjCue.key !== bodyCue.key) flags.push('SUBJECT_BODY_CONFLICT');
  const cues = [...new Set([
    ...names.map((h) => ctx.packages.find((p) => p.id === h.pkgId)!.name),
    ...parseRefs(nameText), ...(cueText.match(/(request for proposal|technical quer\w+|post tender clarifications?|bid tab\w*|last and final offer|letter of award|proposal|quotation|sharepoint|lafo|ptcs?|tqs?)/gi) ?? []),
  ])];

  // ---- AI (simulated or unavailable). Content is untrusted: only the classification is used.
  let ai: AiView | undefined;
  if (s.aiAvailable) {
    ctx.aiCalls++;
    const prompt = s.redactPii ? redactPii(safeContent) : safeContent;
    ctx.aiTokens += Math.ceil((prompt.length + doc.subject.length + 1600) / 4);
    ai = simulatedAi({ text: assertive(prompt), subject: doc.subject, attachments: attNames, role, candidates, namedPkgs: [...named], threadPkg, uniqueBidderPkg, supplier });
  }

  const date = dubaiDate(doc.sentAt ?? doc.receivedAt);
  if (!doc.sentAt) flags.push('MISSING_DATE_HEADER');
  const base = { candidates, ruleHits, ruleMilestone, ai, flags, cues, newContent, date, supplier };

  const procurementSignal = ruleMilestone || ai?.isProcurementEvent;
  if (!procurementSignal) return [mkEvent(doc, { ...base, decision: 'IGNORED', ignoredReason: ai ? 'Not a procurement milestone (AI and rules agree)' : 'No milestone cue in new content' })];

  // E7: one email that explicitly names two packages
  if (named.size > 1) {
    const ok = ruleMilestone && ai && ai.milestone === ruleMilestone;
    if (ok) {
      return [...named].map((pkgId) => {
        const ev = mkEvent(doc, { ...base, pkgId, key: ruleMilestone!, round: roundFor(ctx, pkgId, ruleMilestone!), decision: 'AUTO_COMMITTED', confidence: 0.92, flags: [...flags, 'AUTO_SPLIT'] });
        return ev;
      });
    }
    return [mkEvent(doc, { ...base, decision: 'QUEUED', reason: 'MULTI_PACKAGE', confidence: 0.7 })];
  }

  const top = candidates[0], second = candidates[1];
  const anchor = top?.anchors.some((a) => ['NAME_EXACT', 'NAME_FUZZY', 'REF_UNIQUE', 'THREAD', 'BIDDER_UNIQUE', 'LEARNED_RULE'].includes(a));
  const queue = (reason: ReasonCode, conf: number, pkgId: string | null = top?.pkgId ?? null, key: MilestoneKey | null = ruleMilestone ?? (ai && ai.milestone !== 'none' ? ai.milestone : null)) =>
    [mkEvent(doc, { ...base, pkgId, key, decision: 'QUEUED', reason, confidence: conf })];

  if (!top) return queue('NO_ANCHOR', 0.3, null);
  if (!anchor || (second && second.score >= top.score - 0.05)) return queue('AMBIGUOUS_PACKAGE', Math.min(0.6, top.score));
  if (!ai) return queue('AI_UNAVAILABLE', top.score * 0.8);
  const aiKey = ai.milestone === 'none' ? null : ai.milestone;
  if (ruleMilestone && aiKey && aiKey !== ruleMilestone) return queue('DISAGREEMENT', 0.65);
  if (ai.pkgId && ai.pkgId !== top.pkgId) return queue('DISAGREEMENT', 0.6);
  const key = (ruleMilestone ?? aiKey)!;
  const ruleConf = top.score * (ruleMilestone ? 1 : 0.8);
  const aiConf = Math.min(ai.pkgConfidence, ai.milestoneConfidence || 0.5);
  let conf = 0.5 * ruleConf + 0.5 * aiConf + (ruleMilestone && aiKey === ruleMilestone ? 0.04 : 0);
  if (personal) conf = Math.min(conf, 0.8);
  if (!doc.sentAt) conf = Math.min(conf, 0.75);
  conf = Math.round(Math.min(0.995, conf) * 1000) / 1000;
  if (!ruleMilestone) return queue('LOW_CONFIDENCE', Math.min(conf, 0.85), top.pkgId, key);
  if (conf < s.autoCommitThreshold) return queue(!doc.sentAt ? 'DATE_UNCERTAIN' : 'LOW_CONFIDENCE', conf, top.pkgId, key);

  const ev = mkEvent(doc, { ...base, pkgId: top.pkgId, key, round: roundFor(ctx, top.pkgId, key), decision: 'AUTO_COMMITTED', confidence: conf });
  const bad = validate(ctx, ev);
  if (bad) { ev.decision = 'QUEUED'; ev.reason = bad; }
  return [ev];
}

/** After an event is committed (auto or by admin), link its thread so replies inherit the package (§8.1 step 5). */
export function linkThread(ctx: MatchContext, doc: SourceDoc, pkgId: string) {
  if (doc.messageId) ctx.threads.set(doc.messageId, pkgId);
}

// ---------- aggregation (§4.3)
export function aggregate(events: EvidenceEvent[]): Partial<Record<MilestoneKey, { date: ISODate; eventId: string; round: number; conflicts: number }>> {
  const live = events.filter((e) => e.decision === 'AUTO_COMMITTED' && !e.invalidated && e.key && !String(e.key).endsWith('approved') && e.date);
  const out: ReturnType<typeof aggregate> = {};
  const maxRound = Math.max(1, ...live.map((e) => e.round));
  // milestones 1–3 belong to round 1; milestones 4–15 track the latest tender round (E25)
  const of = (k: MilestoneKey) => live.filter((e) => e.key === k && (MILESTONES.findIndex((m) => m.key === k) < 3 || e.round === maxRound));
  const first = (k: MilestoneKey) => of(k).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const firstDate = (k: MilestoneKey) => first(k)?.date ?? null;
  for (const m of MILESTONES) {
    let evs = of(m.key);
    if (!evs.length) continue;
    let pickEv: EvidenceEvent | undefined;
    if (m.key === 'uploaded_to_obt') {
      // latest valid submission (S3)
      const valid = evs.filter((e) => !e.flags.includes('SUPERSEDED_BY_RESUBMISSION'));
      pickEv = (valid.length ? valid : evs).sort((a, b) => b.date!.localeCompare(a.date!))[0];
    } else if (m.rule === 'FIRST') pickEv = first(m.key);
    else {
      const limit = m.key === 'initial_proposals_received' || m.key === 'tqs_closed' ? firstDate('initial_bid_tab')
        : m.key === 'lafo_proposal_received' ? firstDate('final_bid_tab')
          : m.key === 'final_bid_tab' ? firstDate('trf_created') : null;
      if (limit) evs = evs.filter((e) => e.date! <= limit);
      pickEv = evs.sort((a, b) => b.date!.localeCompare(a.date!))[0];
    }
    if (pickEv) out[m.key] = { date: pickEv.date!, eventId: pickEv.id, round: pickEv.round, conflicts: new Set(evs.map((e) => e.date)).size - 1 };
  }
  return out;
}
