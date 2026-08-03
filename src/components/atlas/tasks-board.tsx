"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  executionStatusBadgeTone,
  formatExecutionStatus,
  formatExecutionTime,
  isActiveExecutionStatus,
  useExecutions,
} from "@/lib/atlas/use-executions";

export function TasksBoard() {
  const { executions, loading, error, refresh } = useExecutions();

  const active = useMemo(
    () => executions.filter((item) => isActiveExecutionStatus(item.status)),
    [executions]
  );

  return (
    <div className="atlas-page atlas-page--board">
      <header className="atlas-board-header">
        <div>
          <p className="atlas-board-header__eyebrow">Tasks</p>
          <h1 className="atlas-board-header__title">Active work</h1>
        </div>
        <button type="button" className="atlas-action atlas-action--ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {loading ? <p className="atlas-board-empty">Loading tasks…</p> : null}
      {error ? (
        <p className="atlas-board-empty atlas-board-empty--error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && active.length === 0 ? (
        <div className="atlas-board-empty-card">
          <strong>No active tasks</strong>
          <p>When Atlas is planning, running, or waiting on approval, it shows up here.</p>
          <Link href="/chat" className="atlas-action atlas-action--primary">
            Open Chat
          </Link>
        </div>
      ) : null}

      {!loading && active.length > 0 ? (
        <div className="atlas-rows">
          {active.map((item) => {
            const tone = executionStatusBadgeTone(item.status);
            const step =
              item.steps.find((s) => s.status === "in_progress")?.description ||
              item.steps.find((s) => s.status === "pending")?.description;
            const progress =
              item.progress?.totalSteps > 0
                ? `${Math.round(item.progress.percentage || 0)}%`
                : null;

            return (
              <Link key={item.id} href="/chat" className="atlas-row atlas-row--link">
                <div className="atlas-row__meta">
                  <div className="atlas-row__title">{item.goal}</div>
                  <div className="atlas-row__body">
                    {step ? `${step} · ` : ""}
                    Updated {formatExecutionTime(item.updatedAt)}
                    {progress ? ` · ${progress}` : ""}
                  </div>
                </div>
                <span className={`atlas-badge atlas-badge--${tone}`}>
                  {formatExecutionStatus(item.status)}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
