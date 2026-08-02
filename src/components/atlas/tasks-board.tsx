"use client";

import { AtlasCard } from "./atlas-card";
import { AtlasSection } from "./atlas-section";
import { useAtlasDemo } from "./atlas-demo-provider";

export function TasksBoard() {
  const { tasks, shoppingStage, startShopping, resetShopping } = useAtlasDemo();

  return (
    <div className="atlas-page">
      <section className="atlas-hero">
        <AtlasCard tone="dark">
          <div className="atlas-mini-stack">
            <p className="atlas-hero__subtle">Tasks</p>
            <h1 className="atlas-hero__title">Every completed action becomes a task.</h1>
            <p className="atlas-hero__lede" style={{ color: "rgba(241, 245, 249, 0.76)" }}>
              Atlas keeps tracking after approval. The result is a living record,
              not a dead confirmation screen.
            </p>
            <div className="atlas-mini-row">
              <span className="atlas-badge atlas-badge--blue">Shopping: {shoppingStage}</span>
              <div className="atlas-chip-row">
                <button type="button" className="atlas-action atlas-action--primary" onClick={startShopping}>
                  Resume shopping
                </button>
                <button type="button" className="atlas-action atlas-action--ghost" onClick={resetShopping}>
                  Reset flow
                </button>
              </div>
            </div>
          </div>
        </AtlasCard>
      </section>

      <div className="atlas-page--split">
        <AtlasSection
          eyebrow="Task center"
          title="Users can see the state of every active commitment."
          description="Tasks stay visible until the journey is complete."
        >
          <div className="atlas-rows">
            {tasks.map((task) => (
              <div className="atlas-row" key={task.id}>
                <div className="atlas-row__meta">
                  <div className="atlas-row__title">{task.title}</div>
                  <div className="atlas-row__body">{task.body}</div>
                </div>
                <span className="atlas-badge atlas-badge--blue">{task.meta}</span>
              </div>
            ))}
          </div>
        </AtlasSection>

        <AtlasSection
          eyebrow="Tracking"
          title="Status changes remain visible from approval to completion."
          description="The task view surfaces progress, receipts, and next steps."
        >
          <AtlasCard>
            <div className="atlas-timeline">
              <div className="atlas-timeline__item">
                <div className="atlas-timeline__time">Now</div>
                <div className="atlas-timeline__title">Search and compare</div>
                <div className="atlas-timeline__body">
                  Atlas is querying providers and building a recommendation set.
                </div>
              </div>
              <div className="atlas-timeline__item">
                <div className="atlas-timeline__time">Next</div>
                <div className="atlas-timeline__title">Awaiting approval</div>
                <div className="atlas-timeline__body">
                  The user reviews price, policy, and payment details before committing.
                </div>
              </div>
              <div className="atlas-timeline__item">
                <div className="atlas-timeline__time">After</div>
                <div className="atlas-timeline__title">Receipt stored</div>
                <div className="atlas-timeline__body">
                  The booking or purchase remains available in Activity and Memory.
                </div>
              </div>
            </div>
          </AtlasCard>
        </AtlasSection>
      </div>
    </div>
  );
}
