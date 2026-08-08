/**
 * IntegrationSelector — Policy Engine
 *
 * Selects an integration to fulfill a capability by running a deterministic
 * policy chain over the candidate integrations that support the capability.
 *
 * Policy chain (runs in this order; earlier policies win):
 *
 *   user-override        0   user explicitly named an integration
 *   enterprise-approved 10   filter to an enterprise-approved allowlist
 *   health              20   skip integrations known to be unhealthy
 *   user-preference     30   user's saved default integration
 *   cost                40   rank by estimated total cost (lowest first)
 *   speed               50   rank by historical latency (lowest first)
 *   fallback           100   pick the highest-scoring remaining candidate
 *
 * The default selector loads candidates through Prisma-backed registry
 * functions. Tests may inject loader overrides so the policy chain can be
 * driven without a database.
 */

import type { CanonicalCapability } from "@/lib/atlas/capabilities/types";
import type {
  IntegrationDefinition,
  IntegrationConfig,
  UserConnection,
} from "./types";

export type SelectionPolicyId =
  | "user-override"
  | "enterprise-approved"
  | "health"
  | "user-preference"
  | "cost"
  | "speed"
  | "fallback";

export const DEFAULT_POLICY_ORDER: SelectionPolicyId[] = [
  "user-override",
  "enterprise-approved",
  "health",
  "user-preference",
  "cost",
  "speed",
  "fallback",
];

export interface SelectionConstraints {
  /** User explicitly named an integration ("use Swiggy"). */
  namedIntegrationId?: string;
  /** Enterprise-approved allowlist. When present, only these are eligible. */
  approvedIds?: string[];
  /** User's saved default integration for the capability. */
  preferredIntegrationId?: string;
  /** Tie-breaker. Defaults to latency (speed) then fallback priority. */
  optimization?: "cost" | "speed";
  /** Require the winning candidate to have an active user connection. */
  requireConnection?: boolean;
}

export interface SelectionCandidate {
  integrationId: string;
  name: string;
  /** Integration-defined capability priority (lower = preferred). */
  priority: number;
  /** Admin config exists, is enabled, and carries credentials. */
  configured: boolean;
  /** User has an active connection row for this integration. */
  connected: boolean;
  connectionId?: string;
  healthy: boolean;
  /** Estimated total cost; lower is better. */
  cost?: number;
  /** Historical latency; lower is better. */
  latencyMs?: number;
  /** Composite score; higher wins in the fallback tier. */
  score: number;
}

export interface PolicyTrace {
  policy: SelectionPolicyId;
  applied: boolean;
  removed?: string[];
  note?: string;
}

export interface SelectionResult {
  integrationId: string;
  connectionId?: string;
  reason: string;
  policies: PolicyTrace[];
  score: number;
  candidates: SelectionCandidate[];
}

export interface SelectionContext {
  capability: CanonicalCapability;
  userId: string;
  constraints?: SelectionConstraints;
}

/** Data loaders. All optional; defaults hit the Prisma-backed registry. */
export interface SelectorLoaders {
  loadIntegrations?: (capability: CanonicalCapability) => Promise<IntegrationDefinition[]>;
  loadConfigs?: (integrationId: string) => Promise<IntegrationConfig | null>;
  loadConnections?: (userId: string) => Promise<UserConnection[]>;
  loadHealth?: (integrationId: string) => Promise<boolean>;
  loadCost?: (integrationId: string) => Promise<number | undefined>;
  loadLatency?: (integrationId: string) => Promise<number | undefined>;
}

const SCORE_CONNECTED = 100;
const SCORE_CONFIGURED = 40;

export class DefaultIntegrationSelector {
  private loaders: SelectorLoaders;
  private policyOrder: SelectionPolicyId[];

  constructor(loaders?: SelectorLoaders, policyOrder?: SelectionPolicyId[]) {
    this.loaders = loaders ?? {};
    this.policyOrder = policyOrder ? [...policyOrder] : [...DEFAULT_POLICY_ORDER];
  }

  /** Select the best integration for the capability, or null when none qualify. */
  async select(ctx: SelectionContext): Promise<SelectionResult | null> {
    const candidates = await this.loadCandidates(ctx);
    if (candidates.length === 0) return null;

    const traces: PolicyTrace[] = [];
    const done = await this.applyPolicies(ctx, candidates, traces);
    if (done) return done;

    if (candidates.length === 0) return null;

    this.scoreWinner(candidates, ctx.constraints?.optimization);
    candidates.sort((a, b) => b.score - a.score);

    traces.push({ policy: "fallback", applied: true });
    const winner = candidates[0];

    return {
      integrationId: winner.integrationId,
      connectionId: winner.connected ? winner.connectionId : undefined,
      reason: this.buildReason(traces),
      policies: traces,
      score: winner.score,
      candidates,
    };
  }

  /** Run selection and return only the winning integration id (or null). */
  async resolveProvider(ctx: SelectionContext): Promise<string | null> {
    const result = await this.select(ctx);
    return result?.integrationId ?? null;
  }

  // ── Policy chain ──

  private async applyPolicies(
    ctx: SelectionContext,
    candidates: SelectionCandidate[],
    traces: PolicyTrace[]
  ): Promise<SelectionResult | null> {
    const constraints = ctx.constraints ?? {};

    if (constraints.requireConnection === true) {
      const kept = candidates.filter((c) => c.connected);
      traces.push({
        policy: "user-preference",
        applied: kept.length !== candidates.length,
        note: "requiring a connected account",
      });
      this.retain(candidates, kept);
    }

    for (const policy of this.policyOrder) {
      switch (policy) {
        case "user-override": {
          const named = constraints.namedIntegrationId;
          if (!named) break;
          const kept = candidates.filter((c) => c.integrationId === named);
          traces.push({ policy: "user-override", applied: true, note: `user named ${named}` });
          if (kept.length > 0) {
            this.retain(candidates, kept);
            return this.immediateResult(candidates, traces);
          }
          this.retain(candidates, []);
          break;
        }

        case "enterprise-approved": {
          const approved = constraints.approvedIds;
          if (!approved || approved.length === 0) break;
          const kept = candidates.filter((c) => approved.includes(c.integrationId));
          traces.push({
            policy: "enterprise-approved",
            applied: kept.length !== candidates.length,
            note: `allowlist ${approved.join(", ")}`,
          });
          this.retain(candidates, kept);
          break;
        }

        case "health": {
          for (const c of candidates) {
            c.healthy = await this.loaderHealth(c.integrationId);
          }
          const unhealthy = candidates.filter((c) => !c.healthy);
          if (unhealthy.length > 0) {
            traces.push({
              policy: "health",
              applied: true,
              removed: unhealthy.map((c) => c.integrationId),
              note: "skipping unhealthy integrations",
            });
            this.retain(candidates, candidates.filter((c) => c.healthy));
          }
          break;
        }

        case "user-preference": {
          const pref = constraints.preferredIntegrationId;
          if (!pref) break;
          const idx = candidates.findIndex((c) => c.integrationId === pref);
          if (idx >= 0) {
            const [preferred] = candidates.splice(idx, 1);
            if (preferred) candidates.unshift(preferred);
          }
          traces.push({ policy: "user-preference", applied: true, note: `preference ${pref}` });
          break;
        }

        case "cost": {
          if (constraints.optimization === "cost") {
            this.rankBy(candidates, (c) => c.cost);
            traces.push({ policy: "cost", applied: true, note: "optimizing for cost" });
          }
          break;
        }

        case "speed": {
          if (constraints.optimization === "speed") {
            this.rankBy(candidates, (c) => c.latencyMs);
            traces.push({ policy: "speed", applied: true, note: "optimizing for speed" });
          }
          break;
        }

        default:
          break;
      }

      if (candidates.length === 0) break;
    }

    return null;
  }

  private rankBy(candidates: SelectionCandidate[], valueOf: (c: SelectionCandidate) => number | undefined): void {
    candidates.sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return av - bv;
    });
  }

  private scoreWinner(candidates: SelectionCandidate[], optimization?: "cost" | "speed"): void {
    candidates.forEach((c, index) => {
      let score = 0;
      if (c.connected) score += SCORE_CONNECTED;
      if (c.configured) score += SCORE_CONFIGURED;
      if (c.healthy) score += 10;
      score += Math.max(0, 100 - index);
      if (optimization === "cost" && c.cost !== undefined) score += 50;
      if (optimization === "speed" && c.latencyMs !== undefined) score += 50;
      c.score = score;
    });
  }

  // ── Candidate builders ──

  private async loadCandidates(ctx: SelectionContext): Promise<SelectionCandidate[]> {
    const [defs, connections] = await Promise.all([
      this.loaderIntegrations(ctx.capability),
      this.loaderConnections(ctx.userId),
    ]);

    const active = new Map<string, UserConnection>();
    for (const conn of connections) {
      if (conn.status === "active" && !active.has(conn.integrationId)) {
        active.set(conn.integrationId, conn);
      }
    }

    const candidates: SelectionCandidate[] = [];
    for (const def of defs) {
      const link = def.capabilities.find((c) => c.capabilityId === ctx.capability);
      if (!link) continue;

      const [cfg, health, cost, latency] = await Promise.all([
        this.loaderConfigs(def.id),
        this.loaderHealth(def.id),
        this.loaderCost(def.id),
        this.loaderLatency(def.id),
      ]);
      const conn = active.get(def.id);

      candidates.push({
        integrationId: def.id,
        name: def.name,
        priority: link.priority,
        configured: Boolean(cfg?.enabled) && Boolean(cfg?.apiKey || cfg?.baseUrl),
        connected: Boolean(conn),
        connectionId: conn?.id,
        healthy: health,
        cost,
        latencyMs: latency,
        score: 0,
      });
    }

    return candidates;
  }

  private retain(candidates: SelectionCandidate[], kept: SelectionCandidate[]): void {
    candidates.length = 0;
    candidates.push(...kept);
  }

  private immediateResult(candidates: SelectionCandidate[], traces: PolicyTrace[]): SelectionResult | null {
    traces.push({ policy: "fallback", applied: true });
    const winner = candidates[0];
    if (!winner) return null;
    winner.score = 1000;
    return {
      integrationId: winner.integrationId,
      connectionId: winner.connected ? winner.connectionId : undefined,
      reason: this.buildReason(traces),
      policies: traces,
      score: winner.score,
      candidates,
    };
  }

  private buildReason(traces: PolicyTrace[]): string {
    return traces
      .filter((t) => t.applied || t.policy === "fallback")
      .map((t) => (t.note ? `${t.policy}(${t.note})` : t.policy))
      .join(" → ");
  }

  // ── Loader resolution (defaults hit the Prisma-backed registry) ──

  private loaderIntegrations(capability: CanonicalCapability): Promise<IntegrationDefinition[]> {
    if (this.loaders.loadIntegrations) return this.loaders.loadIntegrations(capability);
    return import("./registry").then((m) => m.getIntegrationsForCapability(capability));
  }

  private loaderConfigs(integrationId: string): Promise<IntegrationConfig | null> {
    if (this.loaders.loadConfigs) return this.loaders.loadConfigs(integrationId);
    return import("./registry").then((m) =>
      m.getIntegrationConfig(integrationId).then((row) => {
        if (!row) return null;
        return {
          id: row.id,
          integrationId: row.integrationId,
          label: row.label,
          baseUrl: row.baseUrl,
          apiKey: row.apiKey,
          enabled: row.enabled,
          metadata: {},
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } as IntegrationConfig;
      })
    );
  }

  private loaderConnections(userId: string): Promise<UserConnection[]> {
    if (this.loaders.loadConnections) return this.loaders.loadConnections(userId);
    return import("./registry").then((m) =>
      m.listUserConnections(userId).then(
        (rows) =>
          rows.map((r) => ({
            id: r.id,
            userId: r.userId,
            integrationId: r.integrationId,
            displayName: r.displayName,
            oauthToken: r.oauthToken,
            oauthRefresh: r.oauthRefresh,
            tokenExpiresAt: r.tokenExpiresAt,
            apiKey: r.apiKey,
            status: r.status,
            metadata: {},
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })) as UserConnection[]
      )
    );
  }

  private loaderHealth(_integrationId: string): Promise<boolean> {
    if (this.loaders.loadHealth) return this.loaders.loadHealth(_integrationId);
    return Promise.resolve(true);
  }

  private loaderCost(integrationId: string): Promise<number | undefined> {
    if (this.loaders.loadCost) return this.loaders.loadCost(integrationId);
    return Promise.resolve(undefined);
  }

  private loaderLatency(integrationId: string): Promise<number | undefined> {
    if (this.loaders.loadLatency) return this.loaders.loadLatency(integrationId);
    return Promise.resolve(undefined);
  }
}

/** Singleton for the app runtime. */
export const integrationSelector = new DefaultIntegrationSelector();

/**
 * Convenience: resolve the winning integration id for a capability/user,
 * or null when there is no decisive selection. Wraps the singleton.
 */
export async function resolveSelectedProvider(
  capability: CanonicalCapability,
  userId: string,
  constraints?: SelectionConstraints
): Promise<string | null> {
  return integrationSelector.resolveProvider({ capability, userId, constraints });
}