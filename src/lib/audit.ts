import { sha256 } from './sha256';

export type Role = 'admin' | 'manager' | 'leadership';
export interface AuditEntry {
  seq: number; at: string; actor: string; role: Role | 'system'; action: string; entity: string;
  before: unknown; after: unknown; reason?: string; evidence?: string; prevHash: string; hash: string;
}
export const GENESIS = '0'.repeat(64);
const payload = (e: Omit<AuditEntry, 'hash'>) =>
  JSON.stringify([e.seq, e.at, e.actor, e.role, e.action, e.entity, e.before ?? null, e.after ?? null, e.reason ?? null, e.evidence ?? null]);

/** Append-only: returns a new array; hash = sha256(prev_hash + payload). */
export function append(log: AuditEntry[], e: Omit<AuditEntry, 'seq' | 'prevHash' | 'hash' | 'at'> & { at?: string }): AuditEntry[] {
  const prevHash = log.at(-1)?.hash ?? GENESIS;
  const row = { ...e, at: e.at ?? new Date().toISOString(), seq: log.length + 1, prevHash } as Omit<AuditEntry, 'hash'>;
  return [...log, { ...row, hash: sha256(prevHash + payload(row)) }];
}

/** R3: returns null when intact, else the first broken row. */
export function verifyChain(log: AuditEntry[]): { ok: true } | { ok: false; seq: number; why: string } {
  let prev = GENESIS;
  for (const r of log) {
    if (r.prevHash !== prev) return { ok: false, seq: r.seq, why: 'Previous-hash link does not match the row before it' };
    const { hash, ...rest } = r;
    if (sha256(prev + payload(rest)) !== hash) return { ok: false, seq: r.seq, why: 'Row content does not match its hash (edited after writing)' };
    prev = hash;
  }
  return { ok: true };
}
