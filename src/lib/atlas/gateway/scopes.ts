import type { ConnectorAuthProfile } from "./types";

export function checkScopes(
  grantedScopes: string[],
  authProfile: ConnectorAuthProfile
): { allowed: boolean; missing: string[] } {
  const missing = authProfile.requiredScopes.filter((scope) => !grantedScopes.includes(scope));
  return {
    allowed: missing.length === 0,
    missing,
  };
}

export function extractGrantedScopes(oauthScopeString?: string | null): string[] {
  if (!oauthScopeString) return [];
  // Assumes scopes are space-separated or comma-separated
  return oauthScopeString.split(/[\s,]+/).filter(Boolean);
}
