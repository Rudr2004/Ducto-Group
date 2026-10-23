import type { ISODate } from './dates';
import type { MilestoneKey, Owner, PackageStatus } from './milestones';

export type Provenance = 'SYSTEM' | 'LEGACY' | 'ADMIN';
export type MilestoneStatus =
  | 'DONE_ON_TIME' | 'DONE_LATE' | 'DUE_SOON' | 'OVERDUE' | 'UPCOMING'
  | 'NOT_APPLICABLE' | 'NO_PLAN' | 'SKIPPED_MISSING';
export type Health = 'On Track' | 'At Risk' | 'Delayed' | 'Excluded';

export interface Bidder { vendor: string; awarded: boolean; initialProposal?: number | null }

export interface Package {
  id: string; slNo: number; category: string; name: string; ref: string;
  managerRaw: string; manager: string; dateAdded: ISODate | null; obtRef: string | null;
  comments: string; sheetStatus: string; excluded: boolean; isDemo: boolean;
  /** typed anchor from the sheet (planned award) */
  plannedAward: ISODate | null; plannedDtp: ISODate | null;
  sla: Record<MilestoneKey, number>; slaDefaulted: boolean;
  legacy: Record<MilestoneKey, ISODate | null>;
  bidders: Bidder[]; awardedCost: number | null; sheetRows: { planned: number; actual: number };
}

export interface ActualRecord {
  id: string; pkgId: string; key: MilestoneKey; round: number; date: ISODate; source: Provenance;
  evidenceId?: string; confidence?: number; reason?: string; supersededBy?: string; at: string;
}

export interface Rebaseline { pkgId: string; key: MilestoneKey; date: ISODate; reason: string; at: string }

export interface CellView {
  key: MilestoneKey; planned: ISODate | null; baseline: ISODate | null; actual: ISODate | null;
  provenance: Provenance | null; record?: ActualRecord; hiddenFuture: boolean;
  status: MilestoneStatus; variance: number | null; cycle: number | null; sla: number; overSla: number;
}

export interface PackageView {
  pkg: Package; cells: CellView[]; status: PackageStatus; health: Health;
  forecastAward: ISODate | null; slippage: number | null; lastActualIdx: number;
  flags: string[]; daysLost: Record<Owner, number>; systemShare: number; actualCount: number;
}
