"use client";

import { useMemo } from "react";

import { AtlasCard } from "./atlas-card";
import { AtlasSection } from "./atlas-section";
import { useAtlasDemo } from "./atlas-demo-provider";
import {
  shoppingIntent,
  shoppingProgressSteps,
  shoppingProviderFlow,
  shoppingRecommendations,
  shoppingTaskEvents,
} from "@/lib/atlas/shopping";
import { atlasApprovalPolicies } from "@/lib/atlas/approval-policy";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function ShoppingFlow() {
  const {
    shoppingStage: stage,
    selectedShoppingId: selectedId,
    startShopping,
    setShoppingStage,
    selectShoppingRecommendation,
    resetShopping,
  } = useAtlasDemo();

  const selectedProduct = useMemo(
    () =>
      shoppingRecommendations.find((item) => item.id === selectedId) ??
      shoppingRecommendations[0],
    [selectedId]
  );

  const approval = atlasApprovalPolicies.shopping;
  const canApprovePurchase = stage === "approval";

  const startFlow = () => startShopping();
  const approvePurchase = () => {
    if (canApprovePurchase) {
      setShoppingStage("executing");
    }
  };
  const resetFlow = () => resetShopping();

  return (
    <div className="atlas-page">
      <section className="atlas-hero">
        <AtlasCard tone="dark">
          <div className="atlas-mini-stack">
            <p className="atlas-hero__subtle">Shopping flow</p>
            <h1 className="atlas-hero__title">Atlas searches, compares, and asks before it buys.</h1>
            <p className="atlas-hero__lede" style={{ color: "rgba(241, 245, 249, 0.76)" }}>
              {shoppingIntent}
            </p>
            <div className="atlas-chip-row">
              <button type="button" className="atlas-action atlas-action--primary" onClick={startFlow}>
                Start shopping
              </button>
              <button type="button" className="atlas-action atlas-action--ghost" onClick={resetFlow}>
                Reset
              </button>
            </div>
          </div>
        </AtlasCard>
      </section>

      <AtlasSection
        eyebrow="Execution surface"
        title="Atlas uses MCP providers to power the shopping loop."
        description="Discovery comes from commerce surfaces, payment settlement comes from Fewsats, and the approval gate stays in the app."
      >
        <div className="atlas-grid atlas-grid--2">
          {shoppingProviderFlow.map((provider) => (
            <AtlasCard key={provider.id} tone="soft">
              <div className="atlas-card__title">{provider.title}</div>
              <div className="atlas-card__body">{provider.body}</div>
            </AtlasCard>
          ))}
        </div>
      </AtlasSection>

      <AtlasSection
        eyebrow="Live state"
        title="The same control loop is visible in every stage."
        description="The user sees the system working before any purchase is committed."
      >
        <AtlasCard>
          <div className="atlas-flow">
            {shoppingProgressSteps.map((step, index) => {
              const isActive =
                (stage === "searching" && index < 4) ||
                (stage === "review" && index < 5) ||
                (stage === "approval" && index < 5) ||
                (stage === "executing" && index < 5) ||
                stage === "complete";

              return (
                <div className="atlas-flow__stage" key={step} data-active={isActive ? "true" : "false"}>
                  <div className="atlas-flow__dot" />
                  <div>
                    <div className="atlas-flow__title">{step}</div>
                    <div className="atlas-flow__body">
                      {index === 0 && "Atlas is querying shopping providers."}
                      {index === 1 && "Atlas is comparing product coverage and deal quality."}
                      {index === 2 && "Atlas is ranking the most suitable options."}
                      {index === 3 && "Atlas is preparing a recommendation."}
                      {index === 4 && "Atlas is waiting for approval before any payment."}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="atlas-progress" aria-label="Shopping progress">
            <div className="atlas-progress__bar">
              <div
                className="atlas-progress__fill"
                style={{
                  width:
                    stage === "idle"
                      ? "8%"
                      : stage === "searching"
                        ? "42%"
                        : stage === "review"
                          ? "68%"
                          : stage === "approval"
                            ? "82%"
                            : stage === "executing"
                              ? "92%"
                              : "100%",
                }}
              />
            </div>
            <span className="atlas-progress__label">
              {stage === "idle"
                ? "Ready"
                : stage === "searching"
                  ? "Searching"
                  : stage === "review"
                    ? "Reviewing"
                    : stage === "approval"
                      ? "Awaiting approval"
                      : stage === "executing"
                        ? "Executing"
                        : "Complete"}
            </span>
          </div>
        </AtlasCard>
      </AtlasSection>

      <AtlasSection
        eyebrow="Recommendations"
        title="Atlas surfaces visual options with clear tradeoffs."
        description="The recommended option is highlighted, but the user can still compare the alternatives."
      >
        <div className="atlas-grid atlas-grid--3">
          {shoppingRecommendations.map((product) => {
            const active = product.id === selectedProduct.id;

            return (
              <AtlasCard key={product.id} tone={active ? "dark" : "soft"}>
                <div className="atlas-mini-row">
                  <div>
                    <div className={active ? "atlas-card__eyebrow" : "atlas-card__eyebrow"}>
                      {product.provider}
                    </div>
                    <div className="atlas-card__title">{product.title}</div>
                  </div>
                  <span className={`atlas-badge ${product.badge === "Best overall" ? "atlas-badge--green" : "atlas-badge--blue"}`}>
                    {product.badge}
                  </span>
                </div>
                <div className="atlas-card__body">
                  {product.brand} · {formatter.format(product.price)} · {product.delivery}
                </div>
                <div className="atlas-card__body">Rating {product.rating.toFixed(1)} · {product.reason}</div>
                <div className="atlas-chip-row">
                  <button
                    type="button"
                    className={`atlas-action ${active ? "atlas-action--light" : "atlas-action--ghost"}`}
                    onClick={() => {
                      selectShoppingRecommendation(product.id);
                    }}
                  >
                    {active ? "Selected" : "Select"}
                  </button>
                </div>
              </AtlasCard>
            );
          })}
        </div>
      </AtlasSection>

      <AtlasSection
        eyebrow="Approval"
        title="Nothing is purchased without explicit confirmation."
        description="The approval screen is the trust boundary for the entire shopping flow."
      >
        <div className="atlas-grid atlas-grid--2">
          <AtlasCard>
            <div className="atlas-mini-row">
              <div className="atlas-card__title">{approval.title}</div>
              <span className="atlas-badge atlas-badge--amber">{approval.trigger}</span>
            </div>
            <div className="atlas-list">
              <div className="atlas-list__item">
                <div className="atlas-list__label">Item</div>
                <div className="atlas-list__value">{selectedProduct.title}</div>
              </div>
              <div className="atlas-list__item">
                <div className="atlas-list__label">Price</div>
                <div className="atlas-list__value">
                  {formatter.format(selectedProduct.price)} + taxes + shipping
                </div>
              </div>
              <div className="atlas-list__item">
                <div className="atlas-list__label">Payment</div>
                <div className="atlas-list__value">Fewsats MCP wallet</div>
              </div>
              <div className="atlas-list__item">
                <div className="atlas-list__label">Policy</div>
                <div className="atlas-list__value">{selectedProduct.policy}</div>
              </div>
            </div>
            <p className="atlas-quote">{approval.trustNote}</p>
            <div className="atlas-chip-row">
              <button
                type="button"
                className="atlas-action atlas-action--primary"
                onClick={approvePurchase}
                disabled={!canApprovePurchase}
              >
                {approval.primaryAction}
              </button>
              <button type="button" className="atlas-action atlas-action--ghost" onClick={resetFlow}>
                {approval.secondaryAction}
              </button>
            </div>
          </AtlasCard>

          <AtlasCard tone="soft">
            <div className="atlas-card__title">Task tracking</div>
            <div className="atlas-timeline">
              {shoppingTaskEvents.map((event) => (
                <div className="atlas-timeline__item" key={event.title}>
                  <div className="atlas-timeline__time">{event.time}</div>
                  <div className="atlas-timeline__title">{event.title}</div>
                  <div className="atlas-timeline__body">{event.body}</div>
                </div>
              ))}
            </div>
          </AtlasCard>
        </div>
      </AtlasSection>

      <AtlasSection
        eyebrow="Completion"
        title={stage === "complete" ? "Task complete" : "Payment confirmation"}
        description="The final state shows the result, the receipt, and the next step the user may want to take."
      >
        <AtlasCard tone={stage === "complete" ? "dark" : "soft"}>
          <div className="atlas-mini-stack">
            <div className="atlas-mini-row">
              <div>
                <div className="atlas-card__eyebrow">Purchase status</div>
                <div className="atlas-card__title">
                  {stage === "complete" ? "Order secured" : "Waiting for approval"}
                </div>
              </div>
              <span className={`atlas-badge ${stage === "complete" ? "atlas-badge--green" : "atlas-badge--amber"}`}>
                {stage === "complete" ? "Complete" : "Pending"}
              </span>
            </div>

            <div className="atlas-row">
              <div className="atlas-row__meta">
                <div className="atlas-row__title">{selectedProduct.title}</div>
                <div className="atlas-row__body">
                  {selectedProduct.brand} · {selectedProduct.delivery}
                </div>
              </div>
              <span className="atlas-badge atlas-badge--blue">
                {formatter.format(selectedProduct.price)}
              </span>
            </div>

            <div className="atlas-row">
              <div className="atlas-row__meta">
                <div className="atlas-row__title">Next action</div>
                <div className="atlas-row__body">
                  {stage === "complete"
                    ? "View receipt, track shipping, or add to memory."
                    : "Approve the purchase to continue."}
                </div>
              </div>
              <span className="atlas-micro">{stage === "complete" ? "Tracked" : "Ready"}</span>
            </div>

            {stage === "complete" ? (
              <div className="atlas-chip-row">
                <span className="atlas-chip atlas-chip--primary">View receipt</span>
                <span className="atlas-chip">Track shipping</span>
                <span className="atlas-chip">Save preference</span>
              </div>
            ) : null}
          </div>
        </AtlasCard>
      </AtlasSection>
    </div>
  );
}
