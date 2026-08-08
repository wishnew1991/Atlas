import type { MockMcpGateway } from "../helpers/mock-mcp-gateway";

export function assertMcpCalled(
  gateway: MockMcpGateway,
  method: string
): void {
  const calls = gateway.requestLog.filter((r) => r.method === method);
  if (calls.length === 0) {
    const methods = gateway.requestLog.map((r) => r.method).join(", ");
    throw new Error(`Expected MCP method "${method}" to be called. Called: [${methods}]`);
  }
}

export function assertMcpCalledTimes(
  gateway: MockMcpGateway,
  method: string,
  count: number
): void {
  const calls = gateway.requestLog.filter((r) => r.method === method);
  if (calls.length !== count) {
    throw new Error(
      `Expected "${method}" to be called ${count} times but was ${calls.length}`
    );
  }
}

export function assertMcpNotCalled(
  gateway: MockMcpGateway,
  method: string
): void {
  const calls = gateway.requestLog.filter((r) => r.method === method);
  if (calls.length > 0) {
    throw new Error(`Expected "${method}" NOT to be called but it was (${calls.length}x)`);
  }
}

export function assertMcpProtocolVersion(
  gateway: MockMcpGateway,
  expectedVersion: string
): void {
  const initCalls = gateway.requestLog.filter((r) => r.method === "initialize");
  if (initCalls.length === 0) {
    throw new Error("No initialize calls found");
  }
  const params = initCalls[0].params as Record<string, unknown> | undefined;
  if (params?.protocolVersion !== expectedVersion) {
    throw new Error(
      `Expected protocolVersion "${expectedVersion}" but got "${params?.protocolVersion}"`
    );
  }
}

export function assertMcpCallArguments(
  gateway: MockMcpGateway,
  method: string,
  expectedArgs: Record<string, unknown>
): void {
  const calls = gateway.requestLog.filter((r) => r.method === method);
  if (calls.length === 0) {
    throw new Error(`No "${method}" calls found`);
  }
  const args = calls[0].params as Record<string, unknown> | undefined;
  if (!args) throw new Error(`No params in "${method}" call`);
  for (const [key, value] of Object.entries(expectedArgs)) {
    if (JSON.stringify(args[key]) !== JSON.stringify(value)) {
      throw new Error(
        `Expected "${method}" arg "${key}" to be ${JSON.stringify(value)} but got ${JSON.stringify(args[key])}`
      );
    }
  }
}

export function assertMcpCallCount(gateway: MockMcpGateway, min: number): void {
  if (gateway.requestLog.length < min) {
    throw new Error(
      `Expected at least ${min} MCP calls but got ${gateway.requestLog.length}`
    );
  }
}
