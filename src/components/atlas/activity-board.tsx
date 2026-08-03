"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { ActivityAccomplishment } from "@/lib/atlas/activity-types";
import { formatExecutionTime } from "@/lib/atlas/use-executions";
import { useAtlasChat } from "./atlas-chat-provider";

function oneLineSummary(item: ActivityAccomplishment): string {
  const restaurant = item.receipt.find((f) => f.label === "Restaurant")?.value;
  const total = item.receipt.find((f) => f.label === "Total")?.value;
  const parts = [item.title];
  if (restaurant && !item.title.includes(restaurant)) parts.push(restaurant);
  if (total) parts.push(total);
  return parts.join(" · ");
}

export function ActivityBoard() {
  const router = useRouter();
  const chat = useAtlasChat();
  const [items, setItems] = useState<ActivityAccomplishment[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/activity?limit=40", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const detail =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Could not load activity.";
        throw new Error(detail);
      }
      const list =
        typeof payload === "object" &&
        payload !== null &&
        Array.isArray((payload as { items?: unknown }).items)
          ? ((payload as { items: ActivityAccomplishment[] }).items)
          : [];
      setItems(list);
      setExpandedId((current) => {
        if (current && list.some((item) => item.id === current)) return current;
        return null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activity.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const runAction = (item: ActivityAccomplishment, actionId: string) => {
    if (actionId === "order_again") {
      const prompt = item.title.toLowerCase().includes("order")
        ? item.title
        : `Order ${item.title} again`;
      chat.setChatDraft(prompt);
      router.push("/chat");
      return;
    }
    if (actionId === "track" || actionId === "open_chat") {
      router.push("/chat");
    }
  };

  return (
    <div className="atlas-page atlas-page--board">
      <header className="atlas-board-header">
        <div>
          <p className="atlas-board-header__eyebrow">Activity</p>
          <h1 className="atlas-board-header__title">Activity</h1>
        </div>
        <button type="button" className="atlas-action atlas-action--ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {loading ? <p className="atlas-board-empty">Loading activity…</p> : null}
      {error ? (
        <p className="atlas-board-empty atlas-board-empty--error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="atlas-board-empty-card">
          <strong>No activity yet</strong>
          <p>Orders, bookings, and confirmed actions will show up here.</p>
          <Link href="/chat" className="atlas-action atlas-action--primary">
            Open Chat
          </Link>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="atlas-activity-accordion">
          {items.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="atlas-activity-accordion__item"
                data-expanded={expanded ? "true" : "false"}
              >
                <button
                  type="button"
                  className="atlas-activity-accordion__summary"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  <span className="atlas-activity-accordion__line">{oneLineSummary(item)}</span>
                  <span className={`atlas-badge atlas-badge--${item.statusTone}`}>
                    {item.headlineStatus}
                  </span>
                  <span className="atlas-activity-accordion__chevron" aria-hidden="true">
                    {expanded ? "▾" : "▸"}
                  </span>
                </button>

                {expanded ? (
                  <div className="atlas-activity-accordion__panel">
                    <p className="atlas-activity-accordion__when">
                      {formatExecutionTime(item.completedAt || item.createdAt)}
                      {item.orderNumber ? ` · #${item.orderNumber}` : ""}
                    </p>

                    <div className="atlas-receipt__grid">
                      {item.receipt.map((field) => (
                        <div className="atlas-receipt__field" key={`${field.label}-${field.value}`}>
                          <span className="atlas-receipt__label">{field.label}</span>
                          <strong className="atlas-receipt__value">{field.value}</strong>
                        </div>
                      ))}
                    </div>

                    <div className="atlas-receipt__timeline">
                      <p className="atlas-receipt__section-label">Timeline</p>
                      <ol className="atlas-receipt-timeline">
                        {item.timeline.map((step) => (
                          <li
                            key={step.id}
                            className="atlas-receipt-timeline__step"
                            data-state={step.state}
                          >
                            <span className="atlas-receipt-timeline__dot" aria-hidden="true" />
                            <span className="atlas-receipt-timeline__label">{step.label}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="atlas-receipt__actions">
                      {item.actions.map((action) =>
                        action.enabled ? (
                          <button
                            key={action.id}
                            type="button"
                            className={
                              action.id === "open_chat"
                                ? "atlas-action atlas-action--ghost"
                                : "atlas-action atlas-action--primary"
                            }
                            onClick={() => runAction(item, action.id)}
                          >
                            {action.label}
                          </button>
                        ) : null
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
