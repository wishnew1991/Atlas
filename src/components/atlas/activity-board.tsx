"use client";

import { AtlasCard } from "./atlas-card";
import { AtlasSection } from "./atlas-section";
import { useAtlasDemo } from "./atlas-demo-provider";

export function ActivityBoard() {
  const { activity, notifications, dismissNotification } = useAtlasDemo();

  return (
    <div className="atlas-page">
      <section className="atlas-hero">
        <AtlasCard tone="dark">
          <div className="atlas-mini-stack">
            <p className="atlas-hero__subtle">Activity</p>
            <h1 className="atlas-hero__title">History, receipts, and updates in one place.</h1>
            <p className="atlas-hero__lede" style={{ color: "rgba(241, 245, 249, 0.76)" }}>
              Atlas keeps the record clean and searchable so the user can recover
              details at any time.
            </p>
          </div>
        </AtlasCard>
      </section>

      <div className="atlas-page--split">
        <AtlasSection
          eyebrow="Timeline"
          title="Completed actions stay visible and useful."
          description="The timeline behaves like a trusted log, not a noisy feed."
        >
          <AtlasCard>
            <div className="atlas-timeline">
              {activity.map((item) => (
                <div className="atlas-timeline__item" key={item.id}>
                  <div className="atlas-timeline__time">{item.time}</div>
                  <div className="atlas-timeline__title">{item.title}</div>
                  <div className="atlas-timeline__body">{item.body}</div>
                </div>
              ))}
            </div>
          </AtlasCard>
        </AtlasSection>

        <AtlasSection
          eyebrow="Notifications"
          title="Every notification gives the user a next action."
          description="Atlas should reduce work immediately, not create another place to check."
        >
          <div className="atlas-rows">
            {notifications.length === 0 ? (
              <AtlasCard tone="soft">
                <div className="atlas-card__title">No notifications right now</div>
                <div className="atlas-card__body">
                  Atlas has nothing urgent to surface. New updates will appear here as work moves forward.
                </div>
              </AtlasCard>
            ) : (
              notifications.map((item) => (
                <div className="atlas-row" key={item.id}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">{item.title}</div>
                    <div className="atlas-row__body">{item.body}</div>
                  </div>
                  <div className="atlas-chip-row">
                    <span className="atlas-badge atlas-badge--amber">{item.action}</span>
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => dismissNotification(item.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </AtlasSection>
      </div>
    </div>
  );
}
