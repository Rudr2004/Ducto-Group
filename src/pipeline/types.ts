import type { ISODate } from '@/domain/dates';
import type { MilestoneKey } from '@/domain/milestones';

export type SourceKind = 'email' | 'sharepoint' | 'docusign' | 'obt';
export interface Party { name: string; email: string }
export interface Attachment { name: string; size: number }

export interface SourceDoc {
  id: string; kind: SourceKind; fileName: string;
  /** raw bytes hash (sha-256 hex) used for idempotent ingestion (E26) */
  hash: string;
  messageId?: string; inReplyTo?: string; references?: string[];
  from: Party; to: Party[]; cc: Party[]; mailboxes: string[];
  sentAt: string | null; receivedAt: string; subject: string; body: string; html?: string;
  attachments: Attachment[]; headers: Record<string, string>;
  system?: {
    envelopeId?: string; docType?: 'TRF' | 'LOA' | 'LPO' | 'SOA'; status?: string;
    obtRef?: string; packageName?: string; standardRef?: string; path?: string; eventType?: string; approvedAt?: string;
  };
  corrupt?: boolean;
}

export type Decision = 'AUTO_COMMITTED' | 'QUEUED' | 'IGNORED' | 'DUPLICATE' | 'ERROR';
export type ReasonCode =
  | 'AMBIGUOUS_PACKAGE' | 'DISAGREEMENT' | 'LOW_CONFIDENCE' | 'NO_ANCHOR' | 'MULTI_PACKAGE' | 'AI_UNAVAILABLE'
  | 'DOCUSIGN_DECLINED' | 'OBT_RETURNED' | 'DATE_UNCERTAIN' | 'OUT_OF_WINDOW';

export interface Candidate { pkgId: string; score: number; anchors: string[] }
export interface AiView {
  isProcurementEvent: boolean; pkgId: string | null; pkgConfidence: number; milestone: MilestoneKey | 'none';
  milestoneConfidence: number; role: 'sent_by_procurement' | 'received_from_supplier' | 'internal' | 'system';
  supplier: string | null; rationale: string; provider: 'simulated' | 'claude';
  explicitDates: { type: string; date: ISODate; ambiguous: boolean }[];
}

export interface EvidenceEvent {
  id: string; docId: string; pkgId: string | null; key: MilestoneKey | 'trf_approved' | 'obt_approved' | null; round: number;
  date: ISODate | null; decision: Decision; reason?: ReasonCode; ignoredReason?: string;
  confidence: number; ruleHits: string[]; candidates: Candidate[]; ruleMilestone: MilestoneKey | null;
  ai?: AiView; flags: string[]; cues: string[]; newContent: string; invalidated?: boolean;
  resolvedBy?: string; resolution?: string; supplier?: string | null;
}

export interface GroundTruthEntry { pkgId: string | null; key: MilestoneKey | null; effect: 'commit' | 'support' | 'ignore' | 'queue' | 'duplicate' | 'error'; note?: string }
export interface SynthOutput {
  docs: SourceDoc[]; truth: Record<string, GroundTruthEntry>;
  expected: Record<string, Partial<Record<MilestoneKey, ISODate>>>;
  suppliers: { name: string; domains: string[] }[];
  packageBidders: Record<string, string[]>;
  edgeCases: { id: string; title: string; docIds: string[] }[];
}
