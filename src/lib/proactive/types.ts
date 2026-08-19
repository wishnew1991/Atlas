/**
 * Proactive Context Engine — core types.
 *
 * Pipeline: scheduled trigger → gather context → relevance/priority rules →
 * optional LLM composition → user-facing action. The Daily Brief is one consumer.
 */

/** How a trigger is executed. "lazy" = due-check on app/API activity; never
 * described as truly proactive. */
export type TriggerMode = "worker" | "lazy";

export const TRIGGER_TYPE_DAILY = "daily";

export type CandidateKind = "task" | "deadline" | "approval" | "followup" | "info";

export interface CandidateItem {
  /** Stable per candidate, e.g. "execution:ckx123" or "approval:app_44". */
  id: string;
  /** Which provider produced this candidate ("executions", "approvals", "memory-deadlines", "demo"). */
  provider: string;
  /** Human-visible source reference for debugging, e.g. "execution:ckx123". */
  source: string;
  title: string;
  body: string;
  kind: CandidateKind;
  /** REQUIRED — why this surfaced ("Approval pending — expires in 12m"). */
  reason: string;
  urgency: number;
  importance: number;
  /** Provider is privacy-sensitive: excluded if not allowed (never reaches compose/LLM). */
  privacySensitive: boolean;
  dueAt?: string;
  /** Only ever true for demo/preview candidates. Never persisted as delivered. */
  synthetic?: boolean;
}

export interface EffectiveConfig {
  enabled: boolean;
  /** Time-of-day "HH:MM" local, from user trigger or admin default. */
  triggerTime: string;
  providers: string[];
  maxItems: number;
  llmCompose: boolean;
  triggerMode: TriggerMode;
}

export interface UserBriefPreference {
  enabled: boolean;
  schedule: string;
}

export interface AdminBriefDefaults {
  enabled: boolean;
  triggerTime: string;
  providers: string[];
  maxItems: number;
  llmCompose: boolean;
  triggerMode: TriggerMode;
}

export interface ComposedBriefItem {
  itemId: string;
  text: string;
}

export interface ProactiveBriefDraft {
  title: string;
  items: ComposedBriefItem[];
}

export interface BriefEvaluationInput {
  userId: string;
  triggerType?: string;
  now?: Date;
}

export interface BriefEvaluationResult {
  ok: boolean;
  reason?: string;
  brief?: {
    id: string;
    userId: string;
    triggerType: string;
    period: string;
    title: string;
    items: Array<{
      item: CandidateItem;
      text: string;
    }>;
    synthetic: boolean;
    deliveredAt: string;
    acknowledgedAt: string | null;
  };
  /** Preview-only draft for demo runs (never persisted). */
  preview?: {
    title: string;
    items: Array<{ item: CandidateItem; text: string }>;
    synthetic: boolean;
  };
}