export const MILESTONE_KEYS = [
  'dtp_received', 'stp_created', 'provide_link_to_stp', 'float_rfps', 'tq_process', 'tqs_closed',
  'initial_proposals_received', 'initial_bid_tab', 'ptc_process', 'ptc_closed', 'lafo_proposal_received',
  'final_bid_tab', 'trf_created', 'uploaded_to_obt', 'award_issued',
] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export type Stage = 'A' | 'B' | 'C' | 'D';
export type Owner = 'Project team' | 'Procurement' | 'Suppliers' | 'Approvers';
export type AggRule = 'FIRST' | 'LAST';

export interface MilestoneDef {
  key: MilestoneKey; idx: number; code: string; name: string; short: string; stage: Stage;
  statusLabel: PackageStatus; defaultSla: number; owner: Owner; rule: AggRule; optional?: boolean;
  source: string;
}

export const PACKAGE_STATUSES = [
  'Awaiting DTP', 'DTP Received', 'Out To Tender', 'Commercial Review', 'PTC Stage',
  'Final Negotiations', 'OBT Ongoing', 'Awarded',
] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const STAGES: Record<Stage, string> = {
  A: 'Post-award strategy', B: 'Tender', C: 'Tender review', D: 'Award',
};

const raw: Omit<MilestoneDef, 'idx'>[] = [
  { key: 'dtp_received', code: 'A4', name: 'DTP Received', short: 'DTP', stage: 'A', statusLabel: 'DTP Received', defaultSla: 2, owner: 'Project team', rule: 'FIRST', source: 'Email from project team with SharePoint link' },
  { key: 'stp_created', code: 'A5', name: 'STP Created', short: 'STP', stage: 'A', statusLabel: 'DTP Received', defaultSla: 1, owner: 'Procurement', rule: 'FIRST', source: 'SharePoint folder event' },
  { key: 'provide_link_to_stp', code: 'A6', name: 'Provide Link to STP', short: 'STP link', stage: 'A', statusLabel: 'DTP Received', defaultSla: 0, owner: 'Procurement', rule: 'FIRST', source: 'Email sharing STP link' },
  { key: 'float_rfps', code: 'B1', name: 'Float RFPs', short: 'RFPs', stage: 'B', statusLabel: 'Out To Tender', defaultSla: 5, owner: 'Procurement', rule: 'FIRST', source: 'RFP emails to bidders' },
  { key: 'tq_process', code: 'B2', name: 'TQ Process', short: 'TQ', stage: 'B', statusLabel: 'Out To Tender', defaultSla: 5, owner: 'Suppliers', rule: 'FIRST', optional: true, source: 'Supplier TQ emails' },
  { key: 'tqs_closed', code: 'B3', name: 'TQs Closed', short: 'TQ closed', stage: 'B', statusLabel: 'Out To Tender', defaultSla: 1, owner: 'Procurement', rule: 'LAST', optional: true, source: 'TQ closure email' },
  { key: 'initial_proposals_received', code: 'B5', name: 'Initial Proposals Received', short: 'Proposals', stage: 'B', statusLabel: 'Commercial Review', defaultSla: 3, owner: 'Suppliers', rule: 'LAST', source: 'Supplier proposal emails' },
  { key: 'initial_bid_tab', code: 'C1', name: 'Initial Bid Tab', short: 'Bid tab', stage: 'C', statusLabel: 'Commercial Review', defaultSla: 2, owner: 'Procurement', rule: 'FIRST', source: 'Email with bid tab attachment' },
  { key: 'ptc_process', code: 'C2', name: 'PTC Process', short: 'PTC', stage: 'C', statusLabel: 'PTC Stage', defaultSla: 7, owner: 'Procurement', rule: 'FIRST', source: 'PTC emails to bidders' },
  { key: 'ptc_closed', code: 'C3', name: 'PTC Closed', short: 'PTC closed', stage: 'C', statusLabel: 'PTC Stage', defaultSla: 3, owner: 'Suppliers', rule: 'LAST', source: 'Last PTC response' },
  { key: 'lafo_proposal_received', code: 'C5', name: 'LAFO Proposal Received', short: 'LAFO', stage: 'C', statusLabel: 'Final Negotiations', defaultSla: 1, owner: 'Suppliers', rule: 'LAST', source: 'Supplier final offers' },
  { key: 'final_bid_tab', code: 'C6', name: 'Final Bid Tab', short: 'Final tab', stage: 'C', statusLabel: 'Final Negotiations', defaultSla: 2, owner: 'Procurement', rule: 'LAST', source: 'Email with final bid tab' },
  { key: 'trf_created', code: 'C7', name: 'TRF Created', short: 'TRF', stage: 'C', statusLabel: 'Final Negotiations', defaultSla: 2, owner: 'Procurement', rule: 'FIRST', source: 'DocuSign envelope sent' },
  { key: 'uploaded_to_obt', code: 'C8', name: 'Uploaded to OBT', short: 'OBT', stage: 'C', statusLabel: 'OBT Ongoing', defaultSla: 5, owner: 'Approvers', rule: 'FIRST', source: 'OBT export' },
  { key: 'award_issued', code: 'D1', name: 'LPO / LOA / SOA Issued', short: 'Award', stage: 'D', statusLabel: 'Awarded', defaultSla: 0, owner: 'Procurement', rule: 'FIRST', source: 'DocuSign completed / award email' },
];

export const MILESTONES: MilestoneDef[] = raw.map((m, idx) => ({ ...m, idx }));
export const M = Object.fromEntries(MILESTONES.map((m) => [m.key, m])) as Record<MilestoneKey, MilestoneDef>;
export const OWNERS: Owner[] = ['Project team', 'Procurement', 'Suppliers', 'Approvers'];
