import { describe, it, expect, beforeEach, vi } from "vitest";

import { resetAtlasTestState } from "../reset";
import type { Capability } from "@/lib/atlas/planner/planner";
import type { LlmTool } from "@/lib/atlas/llm/types";
import { getRegisteredTools, getToolsForCapabilities } from "@/lib/atlas/tools/registry";

import {
  assertToolNamesContain,
  assertToolNamesDoNotContain,
  assertToolNamesEqual,
  assertToolHasParameter,
  assertToolHasParameters,
  assertToolExists,
  assertAllToolsHaveDescriptions,
  assertToolCount,
} from "../assertions/tools";

import capabilityTools from "../fixtures/tools/capability-tools.json";
import toolSchemas from "../fixtures/tools/tool-schemas.json";

vi.mock("@/lib/atlas/server/model-registry", () => ({
  resolveDefaultModel: vi.fn().mockResolvedValue({ id: "t", provider: "openai", label: "t", apiKey: "k", enabled: true }),
}));

vi.mock("@/lib/atlas/mcp/tools", () => ({
  isMcpToolName: vi.fn((name: string) => name.startsWith("mcp__")),
  executeMcpTool: vi.fn(),
  getDynamicMcpTools: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  resetAtlasTestState();
});

describe("Tool Registry — Tool Discovery", () => {
  it("getRegisteredTools returns all built-in tools", () => {
    const all = getRegisteredTools();
    assertToolCount(all, 13, 20);
  });

  it("all registered tools have names", () => {
    const all = getRegisteredTools();
    for (const tool of all) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe("string");
    }
  });

  it("all registered tools have descriptions", () => {
    const all = getRegisteredTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
    assertAllToolsHaveDescriptions(all);
  });

  it("includes web_search tool", () => {
    const all = getRegisteredTools();
    assertToolExists(all, "web_search");
  });

  it("includes atlas_search tool", () => {
    const all = getRegisteredTools();
    assertToolExists(all, "atlas_search");
  });

  it("includes atlas_prepare_approval tool", () => {
    const all = getRegisteredTools();
    assertToolExists(all, "atlas_prepare_approval");
  });

  it("includes all 11 food tools", () => {
    const all = getRegisteredTools();
    const foodNames = all.filter((t) => t.name.startsWith("food_"));
    expect(foodNames.length).toBeGreaterThanOrEqual(11);
  });

  it("includes routine_decision tool", () => {
    const all = getRegisteredTools();
    assertToolExists(all, "routine_decision");
  });
});

describe("Tool Registry — Capability-to-Tool Mapping", () => {
  for (const fixture of capabilityTools) {
    it(`${fixture.capability} → [${fixture.toolNames.join(", ")}]`, async () => {
      const tools = await getToolsForCapabilities([fixture.capability as Capability]);
      for (const name of fixture.toolNames) {
        assertToolNamesContain(tools, name);
      }
    });
  }

  it("food capability does not include raw MCP tools", async () => {
    const tools = await getToolsForCapabilities(["food"]);
    for (const tool of tools) {
      expect(tool.name).not.toMatch(/^mcp__/);
    }
  });

  it("web capability returns only web_search", async () => {
    const tools = await getToolsForCapabilities(["web"]);
    assertToolNamesEqual(tools, ["web_search"]);
  });

  it("none capability returns empty tools", async () => {
    const tools = await getToolsForCapabilities(["none"]);
    expect(tools.length).toBe(0);
  });

  it("multiple capabilities return union of tools", async () => {
    const tools = await getToolsForCapabilities(["web", "travel"]);
    assertToolNamesContain(tools, "web_search");
    assertToolNamesContain(tools, "atlas_search");
    assertToolNamesContain(tools, "atlas_prepare_approval");
  });

  it("shopping and rides both include atlas_search and approval", async () => {
    const shopTools = await getToolsForCapabilities(["shopping"]);
    assertToolNamesContain(shopTools, "atlas_search");
    assertToolNamesContain(shopTools, "atlas_prepare_approval");

    const rideTools = await getToolsForCapabilities(["rides"]);
    assertToolNamesContain(rideTools, "atlas_search");
    assertToolNamesContain(rideTools, "atlas_prepare_approval");
  });

  it("food capability excludes raw mcp tools", async () => {
    const tools = await getToolsForCapabilities(["food"]);
    const mcpTools = tools.filter((t) => t.name.startsWith("mcp__"));
    expect(mcpTools.length).toBe(0);
  });
});

describe("Tool Registry — Tool Schemas", () => {
  it("web_search requires query parameter", () => {
    const all = getRegisteredTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
    const tool = assertToolExists(all, "web_search");
    assertToolHasParameter(tool, "query", true);
  });

  it("atlas_search requires request parameter", () => {
    const all = getRegisteredTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
    const tool = assertToolExists(all, "atlas_search");
    assertToolHasParameter(tool, "request", true);
    assertToolHasParameter(tool, "domain");
  });

  it("atlas_prepare_approval requires domain and request", () => {
    const all = getRegisteredTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
    const tool = assertToolExists(all, "atlas_prepare_approval");
    assertToolHasParameter(tool, "domain", true);
    assertToolHasParameter(tool, "request", true);
  });

  for (const fixture of toolSchemas) {
    it(`"${fixture.name}" has expected parameters`, () => {
      const all = getRegisteredTools().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
      const tool = assertToolExists(all, fixture.name);

      for (const param of fixture.params) {
        assertToolHasParameter(tool, param);
      }

      const req = tool.parameters?.required ?? [];
      for (const required of fixture.required) {
        if (!req.includes(required)) {
          throw new Error(
            `Expected "${required}" to be required for "${fixture.name}"`
          );
        }
      }
    });

    it(`"${fixture.name}" has meaningful description`, () => {
      const all = getRegisteredTools().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
      const tool = assertToolExists(all, fixture.name);
      expect(tool.description.length).toBeGreaterThanOrEqual(
        fixture.description.length
      );
    });
  }
});

describe("Tool Registry — Golden Snapshot", () => {
  it("getRegisteredTools snapshot", () => {
    const tools = getRegisteredTools().map((t) => ({
      name: t.name,
      description: t.description,
      paramNames: Object.keys(t.parameters?.properties ?? {}),
      required: t.parameters?.required ?? [],
    }));
    expect(tools).toMatchSnapshot();
  });

  for (const fixture of capabilityTools) {
    it(`getToolsForCapabilities(["${fixture.capability}"]) snapshot`, async () => {
      const tools = await getToolsForCapabilities([fixture.capability as Capability]);
      const simplified = tools.map((t) => ({ name: t.name, description: t.description }));
      expect(simplified).toMatchSnapshot();
    });
  }
});
