import { describe, it, expect, beforeEach } from "vitest";

import {
  DefaultIntegrationSelector,
  type SelectorLoaders,
} from "@/lib/atlas/integrations/selector";
import type {
  IntegrationConfig,
  IntegrationDefinition,
  UserConnection,
} from "@/lib/atlas/integrations/types";
import type { CanonicalCapability } from "@/lib/atlas/capabilities/types";

function makeIntegration(
  id: string,
  name: string,
  priority: number,
  capability: CanonicalCapability = "food"
): IntegrationDefinition {
  return {
    id,
    name,
    transport: "mcp",
    authMethods: [],
    enabled: true,
    capabilities: [{ capabilityId: capability, priority }],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makeConfig(integrationId: string): IntegrationConfig | null {
  return {
    id: integrationId,
    integrationId,
    enabled: true,
    apiKey: "sk-test",
    baseUrl: "https://example.com",
    label: null,
    metadata: {},
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makeConnection(
  id: string,
  integrationId: string,
  status: UserConnection["status"] = "active"
): UserConnection {
  return {
    id,
    userId: "user-1",
    integrationId,
    status,
    oauthToken: "tok",
    apiKey: null,
    oauthRefresh: null,
    tokenExpiresAt: null,
    displayName: null,
    metadata: {},
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

interface FakeLoaders {
  defs: IntegrationDefinition[];
  connections: UserConnection[];
  health: Record<string, boolean>;
  cost: Record<string, number>;
  latency: Record<string, number>;
}

function loaderFor(fake: FakeLoaders): SelectorLoaders {
  return {
    loadIntegrations: async () => fake.defs.filter((d) => d.enabled),
    loadConfigs: async (id) => makeConfig(id),
    loadConnections: async () => fake.connections,
    loadHealth: async (id) => fake.health[id] ?? true,
    loadCost: async (id) => fake.cost[id],
    loadLatency: async (id) => fake.latency[id],
  };
}

const FOOD: CanonicalCapability = "food";
const USER = "user-1";

function foodDefs(): IntegrationDefinition[] {
  return [
    makeIntegration("swiggy", "Swiggy", 1),
    makeIntegration("zomato", "Zomato", 2),
    makeIntegration("uber_eats", "Uber Eats", 3),
  ];
}

describe("IntegrationSelector — Policy Engine", () => {
  let fake: FakeLoaders;

  beforeEach(() => {
    fake = {
      defs: foodDefs(),
      connections: [],
      health: {},
      cost: {},
      latency: {},
    };
  });

  it("returns null when no integrations support the capability", async () => {
    const selector = new DefaultIntegrationSelector(loaderFor({ ...fake, defs: [] }));
    const result = await selector.select({ capability: FOOD, userId: USER });
    expect(result).toBeNull();
  });

  it("picks the highest-priority integration via fallback", async () => {
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({ capability: FOOD, userId: USER });
    expect(result?.integrationId).toBe("swiggy");
  });

  it("applies user-override and selects the named integration", async () => {
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({
      capability: FOOD,
      userId: USER,
      constraints: { namedIntegrationId: "zomato" },
    });
    expect(result?.integrationId).toBe("zomato");
    expect(result?.reason).toContain("user-override");
  });

  it("filters to the enterprise-approved allowlist", async () => {
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({
      capability: FOOD,
      userId: USER,
      constraints: { approvedIds: ["swiggy"] },
    });
    expect(result?.integrationId).toBe("swiggy");
  });

  it("skips unhealthy integrations through the health gate", async () => {
    fake.health.swiggy = false;
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({ capability: FOOD, userId: USER });
    expect(result?.integrationId).not.toBe("swiggy");
    expect(result?.policies.find((p) => p.policy === "health")?.applied).toBe(true);
  });

  it("prefers the user's saved default via user-preference", async () => {
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({
      capability: FOOD,
      userId: USER,
      constraints: { preferredIntegrationId: "uber_eats" },
    });
    expect(result?.integrationId).toBe("uber_eats");
    expect(result?.reason).toContain("user-preference");
  });

  it("ranks by cost when optimizing for cost", async () => {
    fake.cost = { swiggy: 100, zomato: 50, uber_eats: 200 };
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({
      capability: FOOD,
      userId: USER,
      constraints: { optimization: "cost" },
    });
    expect(result?.integrationId).toBe("zomato");
    expect(result?.reason).toContain("cost");
  });

  it("ranks by latency when optimizing for speed", async () => {
    fake.latency = { swiggy: 900, zomato: 400, uber_eats: 1200 };
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({
      capability: FOOD,
      userId: USER,
      constraints: { optimization: "speed" },
    });
    expect(result?.integrationId).toBe("zomato");
    expect(result?.reason).toContain("speed");
  });

  it("requires an active connection when requireConnection is set", async () => {
    fake.connections = [makeConnection("conn-1", "swiggy")];
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({
      capability: FOOD,
      userId: USER,
      constraints: { requireConnection: true },
    });
    expect(result?.integrationId).toBe("swiggy");
    expect(result?.connectionId).toBe("conn-1");
  });

  it("ignores revoked connections when resolving active state", async () => {
    fake.connections = [makeConnection("conn-1", "zomato", "revoked")];
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({
      capability: FOOD,
      userId: USER,
      constraints: { requireConnection: true },
    });
    expect(result).toBeNull();
  });

  it("returns the winning provider id via resolveProvider", async () => {
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const id = await selector.resolveProvider({ capability: FOOD, userId: USER });
    expect(id).toBe("swiggy");
  });

  it("builds a human-readable reason chain", async () => {
    fake.health.zomato = false;
    const selector = new DefaultIntegrationSelector(loaderFor(fake));
    const result = await selector.select({
      capability: FOOD,
      userId: USER,
      constraints: { preferredIntegrationId: "swiggy" },
    });
    expect(result?.reason).toContain("user-preference");
    expect(result?.reason).toContain("swiggy");
    expect(result?.reason).toContain("health");
  });
});