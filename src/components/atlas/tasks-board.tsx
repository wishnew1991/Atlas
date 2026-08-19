"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  executionStatusBadgeTone,
  formatExecutionStatus,
  formatExecutionTime,
  useExecutions,
  type PublicExecution,
} from "@/lib/atlas/use-executions";

function ExecutionRow({ item }: { item: PublicExecution }) {
  const tone = executionStatusBadgeTone(item.status);
  const step =
    item.steps.find((s) => s.status === "in_progress")?.description ||
    item.steps.find((s) => s.status === "pending")?.description;
  const progress =
    item.progress?.totalSteps > 0
      ? `${Math.round(item.progress.percentage || 0)}%`
      : null;

  return (
    <Link href="/chat" className="atlas-row atlas-row--link">
      <div className="atlas-row__meta">
        <div className="atlas-row__title">{item.goal}</div>
        <div className="atlas-row__body">
          {step ? `${step} · ` : ""}
          Updated {formatExecutionTime(item.updatedAt)}
          {progress ? ` · ${progress}` : ""}
        </div>
      </div>
      <span className={`atlas-badge ${tone}`}>
        {formatExecutionStatus(item.status)}
      </span>
    </Link>
  );
}

export function TasksBoard() {
  const { executions, loading, error, refresh } = useExecutions();

  const needsYou = useMemo(
    () =>
      executions.filter(
        (item) => item.status === "pending_approval" || item.status === "blocked"
      ),
    [executions]
  );

  const inProgress = useMemo(
    () =>
      executions.filter(
        (item) =>
          item.status !== "pending_approval" &&
          item.status !== "blocked" &&
          item.status !== "completed" &&
          item.status !== "failed" &&
          item.status !== "cancelled"
      ),
    [executions]
  );

  const hasWork = needsYou.length > 0 || inProgress.length > 0;

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

      {!loading && !error && !hasWork ? (
        <div className="atlas-board-empty-card">
          <strong>No active tasks</strong>
          <p>When Atlas is planning, running, or waiting on approval, it shows up here.</p>
          <Link href="/chat" className="atlas-action atlas-action--primary">
            Open Chat
          </Link>
        </div>
      ) : null}

      {!loading && hasWork ? (
        <div className="atlas-rows">
          {needsYou.length > 0 ? (
            <div className="atlas-zone atlas-zone--needs-you">
              <div className="atlas-zone__head">
                <span className="atlas-zone__title">Needs you</span>
                <span className="atlas-zone__hint">
                  High-risk actions like payments wait here for your approval.
                </span>
                <span className="atlas-conn-zone__count">{needsYou.length}</span>
              </div>
              {needsYou.map((item) => (
                <ExecutionRow key={item.id} item={item} />
              ))}
            </div>
          ) : null}

          {inProgress.length > 0 ? (
            <div className="atlas-zone">
              <div className="atlas-zone__head">
                <span className="atlas-zone__title">In progress</span>
                <span className="atlas-conn-zone__count">{inProgress.length}</span>
              </div>
              {inProgress.map((item) => (
                <ExecutionRow key={item.id} item={item} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}