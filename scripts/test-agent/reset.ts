import { clearClassifierCache } from "@/lib/atlas/planner/classifier";
import { resetAllRateLimits, clearRateLimitTimer } from "@/lib/security/rate-limiter";
import { resetExecutionQueue } from "@/lib/queue/in-process";
import { resetRunners } from "@/lib/atlas/routines/registry";
import { resetRegistered } from "@/lib/atlas/routines/index";
import { invalidateCapabilityCache } from "@/lib/atlas/mcp/registry";

export function resetAtlasTestState(): void {
  clearClassifierCache();
  resetAllRateLimits();
  resetExecutionQueue();
  resetRunners();
  resetRegistered();
  invalidateCapabilityCache();
}

export function resetAtlasTestTimers(): void {
  clearRateLimitTimer();
}
