import type { MatchSettings } from './match';
import { PROJECT_TEAM } from './synth';

export const DEFAULT_MATCH: MatchSettings = {
  autoCommitThreshold: 0.9, queueFloor: 0.6, aiAvailable: true, redactPii: true,
  internalDomains: ['dutco.ae', 'dbb.ae'], projectTeam: [PROJECT_TEAM.email], tokenBudgetChars: 12_000,
};
