"use client";

import { AtlasCard } from "./atlas-card";
import { useAtlasDemo } from "./atlas-demo-provider";
import { shoppingRecommendations } from "@/lib/atlas/shopping";

const stageLabel: Record<string, string> = {
  idle: "Ready",
  searching: "Searching",
  review: "Reviewing",
  approval: "Awaiting approval",
  executing: "Executing",
  complete: "Complete",
};

export function HomeLiveStatus() {
  const { shoppingStage, shoppingIntent, tasks, notifications, selectedShoppingId } = useAtlasDemo();
  const selectedTitle =
    shoppingRecommendations.find((item) => item.id === selectedShoppingId)?.title ??
    shoppingRecommendations[0]?.title ??
    "Selected product";

  return (
    <AtlasCard tone="soft">
      <div className="atlas-hero__panel">
        <div className="atlas-mini-row">
          <span className="atlas-pill">
            <span className="atlas-pulse" aria-hidden="true" />
            Live system
          </span>
          <span className="atlas-micro">{notifications.length} notifications</span>
        </div>
        <strong className="atlas-card__title">
          {stageLabel[shoppingStage] ?? "Ready"} across {tasks.length} tasks
        </strong>
        <p className="atlas-card__body">
          {shoppingIntent}
        </p>
        <div className="atlas-row">
          <div className="atlas-row__meta">
            <div className="atlas-row__title">{selectedTitle}</div>
            <div className="atlas-row__body">Current recommendation context inside Atlas.</div>
          </div>
          <span className="atlas-badge atlas-badge--blue">{stageLabel[shoppingStage] ?? "Ready"}</span>
        </div>
        <div className="atlas-progress" aria-label="Search progress">
          <div className="atlas-progress__bar">
            <div
              className="atlas-progress__fill"
              style={{
                width:
                  shoppingStage === "idle"
                    ? "12%"
                    : shoppingStage === "searching"
                      ? "40%"
                      : shoppingStage === "review"
                        ? "68%"
                        : shoppingStage === "approval"
                          ? "82%"
                          : shoppingStage === "executing"
                            ? "92%"
                            : "100%",
              }}
            />
          </div>
          <span className="atlas-progress__label">{stageLabel[shoppingStage] ?? "Ready"}</span>
        </div>
      </div>
    </AtlasCard>
  );
}

