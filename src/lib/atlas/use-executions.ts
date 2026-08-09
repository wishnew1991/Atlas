"use client";

import { useCallback, useEffect, useState } from "react";

import type { ExecutionStatus } from "@/lib/execution/types";

export type PublicExecutionStep = {
  id: string;
  description: string;
  status: string;
  capability: string;
};

export type PublicExecution = {
  id: string;
  goal: string;
  type: string;
  status: ExecutionStatus;
  progress: {
    currentStep: number;
    totalSteps: number;
    percentage: number;
  };
  steps: PublicExecutionStep[];
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

const ACTIVE_STATUSES: ReadonlySet<ExecutionStatus> = new Set<ExecutionStatus>([
  "planning",
  "pending_approval",
  "executing",
  "observing",
  "reflecting",
  "blocked",
]);

const HISTORY_STATUSES: ReadonlySet<ExecutionStatus> = new Set<ExecutionStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export function isActiveExecutionStatus(status: ExecutionStatus) {
  return ACTIVE_STATUSES.has(status);
}

export function isHistoryExecutionStatus(status: ExecutionStatus) {
  return HISTORY_STATUSES.has(status);
}

export function formatExecutionStatus(status: ExecutionStatus): string {
  switch (status) {
    case "pending_approval":
      return "Needs approval";
    case "planning":
      return "Planning";
    case "executing":
      return "Running";
    case "observing":
      return "Observing";
    case "reflecting":
      return "Reflecting";
    case "blocked":
      return "Blocked";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function executionStatusBadgeTone(
  status: ExecutionStatus
): "blue" | "amber" | "green" | "red" {
  if (status === "pending_approval" || status === "blocked") return "amber";
  if (status === "completed") return "green";
  if (status === "failed" || status === "cancelled") return "red";
  return "blue";
}

export function formatExecutionTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function useExecutions(limit = 50) {
  const [executions, setExecutions] = useState<PublicExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/executions?limit=${limit}`, {
        cache: "no-store",
      });
      
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (err) {
        throw new Error(!response.ok ? "Server error." : "Invalid JSON response.");
      }
      
      if (!response.ok) {
        const detail =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Could not load executions.";
        throw new Error(detail);
      }

      const list =
        typeof payload === "object" &&
        payload !== null &&
        Array.isArray((payload as { executions?: unknown }).executions)
          ? ((payload as { executions: PublicExecution[] }).executions)
          : [];

      setExecutions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load executions.");
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return { executions, loading, error, refresh };
}
