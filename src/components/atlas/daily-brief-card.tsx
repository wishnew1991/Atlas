"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BriefItem = {
  item: {
    id: string;
    provider: string;
    source: string;
    title: string;
    body: string;
    kind: string;
    reason: string;
    privacySensitive?: boolean;
    dueAt?: string | null;
    synthetic?: boolean;
  };
  text: string;
};

type Brief = {
  id: string;
  triggerType: string;
  period: string;
  title: string;
  items: BriefItem[];
  deliveredAt: string;
  acknowledgedAt: string | null;
};

type Pref = { enabled: boolean; schedule: string };

const EMPTY_PREF: Pref = { enabled: false, schedule: "07:00" };

function labelForKind(kind: string): string {
  switch (kind) {
    case "approval":
      return "Approval";
    case "deadline":
      return "Deadline";
    case "followup":
      return "Follow-up";
    case "info":
      return "Heads-up";
    default:
      return "Task";
  }
}

/** At-a-glance Daily Brief widget for the signed-in user. */
export function DailyBriefCard({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useState<Pref | null>(null);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const dueCheckedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefRes, briefRes] = await Promise.all([
        fetch("/api/proactive/prefs", { cache: "no-store" }),
        fetch("/api/proactive/briefs?limit=6", { cache: "no-store" }),
      ]);
      const prefPayload = (await prefRes.json()) as { pref?: Pref | null };
      const briefPayload = (await briefRes.json()) as { briefs?: Brief[] };
      setPref(prefPayload.pref ?? null);
      setBriefs(Array.isArray(briefPayload.briefs) ? briefPayload.briefs : []);
    } catch {
      setError("Daily Brief is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Lazy trigger: when the user has Daily Brief on, ask the server once whether
  // it is due today — it only generates a brief when the trigger time passed.
  const runDueCheck = useCallback(async () => {
    if (dueCheckedRef.current) return;
    dueCheckedRef.current = true;
    try {
      await fetch("/api/proactive/due", { cache: "no-store" });
      await load();
    } catch {
      /* non-fatal: briefs list still loads */
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pref?.enabled && !loading) void runDueCheck();
  }, [pref, loading, runDueCheck]);

  const acknowledge = async (brief: Brief) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/proactive/briefs/${brief.id}/ack`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("ack failed");
      setBriefs((prev) =>
        prev.map((b) =>
          b.id === brief.id ? { ...b, acknowledgedAt: new Date().toISOString() } : b
        )
      );
    } catch {
      setError("Could not mark the brief as read.");
    } finally {
      setUpdating(false);
    }
  };

  const enabledPref = pref?.enabled ?? false;
  const latestUnread = briefs.find((b) => !b.acknowledgedAt) ?? briefs[0] ?? null;

  return (
    <section className="atlas-brief-card" aria-label="Daily Brief">
      <div className="atlas-brief-card__head">
        <div>
          <p className="atlas-brief-card__eyebrow">Daily Brief</p>
          <h2 className="atlas-brief-card__title">
            {loading ? "Checking…" : latestUnread ? latestUnread.title : "Nothing new today"}
          </h2>
          {pref ? (
            <p className="atlas-brief-card__lede">
              {enabledPref
                ? `Delivered around ${pref.schedule} · today's items below`
                : "Off — turn it on in Profile for a short rundown each morning."}
            </p>
          ) : (
            <p className="atlas-brief-card__lede">A short morning rundown of what needs you.</p>
          )}
        </div>
      </div>

      {error ? (
        <p className="atlas-brief-card__error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && enabledPref && latestUnread ? (
        <ul className="atlas-brief-card__items">
          {latestUnread.items.map((entry, index) => (
            <li className="atlas-brief-card__item" key={`${entry.item.id}-${index}`}>
              <span className="atlas-brief-card__badge">{labelForKind(entry.item.kind)}</span>
              <div className="atlas-brief-card__copy">
                <span className="atlas-brief-card__item-title">{entry.text}</span>
                <span className="atlas-brief-card__item-reason">{entry.item.reason}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && enabledPref && latestUnread && !latestUnread.acknowledgedAt ? (
        <div className="atlas-brief-card__actions">
          <button
            type="button"
            className="atlas-action atlas-action--primary atlas-brief-card__ack"
            disabled={updating}
            onClick={() => void acknowledge(latestUnread)}
          >
            Got it
          </button>
        </div>
      ) : null}

      {!compact && !loading && pref && !enabledPref ? (
        <p className="atlas-brief-card__notice">
          Your brief is generated here and in Chat as a summary card — nothing sensitive is ever
          included unless it needs you.
        </p>
      ) : null}
    </section>
  );
}