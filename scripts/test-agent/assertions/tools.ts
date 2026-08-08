import type { LlmTool } from "@/lib/atlas/llm/types";

export function assertToolNamesContain(tools: LlmTool[], expected: string): void {
  const names = tools.map((t) => t.name);
  if (!names.includes(expected)) {
    throw new Error(
      `Expected tools to include "${expected}" but got [${names.join(", ")}]`
    );
  }
}

export function assertToolNamesDoNotContain(tools: LlmTool[], unexpected: string): void {
  const names = tools.map((t) => t.name);
  if (names.includes(unexpected)) {
    throw new Error(
      `Expected tools to NOT include "${unexpected}" but it was present`
    );
  }
}

export function assertToolNamesEqual(tools: LlmTool[], expected: string[]): void {
  const names = [...tools.map((t) => t.name)].sort();
  const expectedSorted = [...expected].sort();
  const namesStr = JSON.stringify(names);
  const expectedStr = JSON.stringify(expectedSorted);
  if (namesStr !== expectedStr) {
    throw new Error(
      `Expected tool names [${expectedSorted.join(", ")}] but got [${names.join(", ")}]`
    );
  }
}

export function assertToolHasParameter(
  tool: LlmTool,
  paramName: string,
  required?: boolean
): void {
  const props = tool.parameters?.properties;
  if (!props || !(paramName in props)) {
    throw new Error(
      `Expected tool "${tool.name}" to have parameter "${paramName}"`
    );
  }
  if (required !== undefined) {
    const req = tool.parameters?.required ?? [];
    const isRequired = req.includes(paramName);
    if (isRequired !== required) {
      throw new Error(
        `Expected "${paramName}" required=${required} but got ${isRequired}`
      );
    }
  }
}

export function assertToolHasParameters(tool: LlmTool, expected: string[]): void {
  const props = Object.keys(tool.parameters?.properties ?? {});
  const missing = expected.filter((p) => !props.includes(p));
  if (missing.length > 0) {
    throw new Error(
      `Tool "${tool.name}" missing parameters: [${missing.join(", ")}]`
    );
  }
}

export function assertToolExists(tools: LlmTool[], name: string): LlmTool {
  const found = tools.find((t) => t.name === name);
  if (!found) {
    const names = tools.map((t) => t.name).join(", ");
    throw new Error(`Expected tool "${name}" to exist. Available: [${names}]`);
  }
  return found;
}

export function assertAllToolsHaveNames(tools: LlmTool[]): void {
  for (const tool of tools) {
    if (!tool.name || typeof tool.name !== "string") {
      throw new Error("All tools must have a valid name");
    }
  }
}

export function assertAllToolsHaveDescriptions(tools: LlmTool[]): void {
  for (const tool of tools) {
    if (!tool.description || typeof tool.description !== "string") {
      throw new Error(`Tool "${tool.name}" is missing a description`);
    }
  }
}

export function assertToolCount(tools: LlmTool[], min: number, max?: number): void {
  if (tools.length < min) {
    throw new Error(
      `Expected at least ${min} tools but got ${tools.length}`
    );
  }
  if (max !== undefined && tools.length > max) {
    throw new Error(
      `Expected at most ${max} tools but got ${tools.length}`
    );
  }
}
