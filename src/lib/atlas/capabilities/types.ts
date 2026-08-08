/**
 * Canonical Capability Registry
 *
 * The single source of truth for capability identifiers. Every component
 * that references a capability (Planner, Tool Registry, Workflow) imports
 * from here. Adding a new built-in capability means:
 *   1. Add the identifier to CANONICAL_CAPABILITIES
 *   2. Register the capability in the database (seed script)
 *   3. Wire Planner/Tool/Workflow support
 *
 * The Capability table in the database stores UI-level metadata (name, icon,
 * description, category). The TypeScript type enforces compile-time checks
 * throughout the codebase.
 */

export const CANONICAL_CAPABILITIES = [
  "food",
  "travel",
  "shopping",
  "rides",
  "appointments",
  "calendar",
  "communication",
  "web",
  "payments",
  "email",
  "documents",
  "messaging",
  "none",
] as const;

export type CanonicalCapability = (typeof CANONICAL_CAPABILITIES)[number];

/** Action domains that map onto MCP-backed capabilities. */
export const ACTION_CAPABILITIES: CanonicalCapability[] = [
  "food",
  "travel",
  "shopping",
  "rides",
  "appointments",
];

export function isCanonicalCapability(value: string): value is CanonicalCapability {
  return (CANONICAL_CAPABILITIES as readonly string[]).includes(value);
}

export function isActionCapability(value: string): boolean {
  return (ACTION_CAPABILITIES as readonly string[]).includes(value);
}
