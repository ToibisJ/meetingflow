/**
 * The AI layer's public surface.
 *
 * Screens and server actions import from here. Nothing outside this folder
 * imports a provider, a prompt or the Anthropic SDK directly — that is what
 * keeps a second provider a drop-in change rather than a rewrite.
 */

export type {
  AIProvider,
  AiEffort,
  AiOutcome,
  AiResult,
  AiFailure,
  AiUsage,
} from "./provider";
export { aiProvider } from "./provider";

export type { AiContext, AiCallResult } from "./gateway";
export { decideSuggestion } from "./gateway";

export {
  computePriority,
  factorSummary,
  type PriorityBand,
  type PriorityFactor,
  type PriorityInput,
  type PriorityResult,
} from "./priority";

export {
  estimateCost,
  monthlyBudget,
  usageByFeature,
  type BudgetState,
} from "./usage";

export { buildCommandCenter, type CommandCenterResult } from "./command-center";
export { draftMessage, type DraftMessageInput } from "./message-generation";
export {
  prepareForMeeting,
  type MeetingBriefFacts,
  type MeetingBriefResult,
} from "./meeting-preparation";
export { structureSummary, detectFollowUp } from "./meeting-summary";
export {
  findPossibleDuplicates,
  type DuplicateCandidate,
} from "./duplicate-detection";
export {
  naturalLanguageSearch,
  type NaturalSearchResult,
  type SearchResultRow,
} from "./natural-language-search";
export {
  buildManagerBrief,
  type BriefMetrics,
  type ManagerBriefResult,
} from "./manager-brief";
export { parseIntake } from "./smart-intake";
export {
  findStaleRequests,
  recommendForStale,
  type StaleRequest,
} from "./stale-detection";

export type {
  CommandCenter,
  DraftMessage,
  DuplicateVerdict,
  ExtractedTask,
  FollowUpDetection,
  ManagerBrief,
  MeetingPrep,
  MessageKind,
  SearchFilter,
  SmartIntake,
  StaleRecommendation,
  StructuredSummary,
} from "./schemas";
export { MESSAGE_KINDS } from "./schemas";
