"use client";

import { AtlasCard } from "./atlas-card";
import { AtlasSection } from "./atlas-section";
import { useAtlasDemo } from "./atlas-demo-provider";

export function ProfileBoard() {
  const {
    memoryGroups,
    walletRows,
    connectedAccounts,
    privacyControls,
    shoppingStage,
    toggleConnectedAccount,
    togglePrivacyControl,
  } = useAtlasDemo();

  return (
    <div className="atlas-page">
      <section className="atlas-hero">
        <AtlasCard tone="dark">
          <div className="atlas-mini-stack">
            <p className="atlas-hero__subtle">Profile</p>
            <h1 className="atlas-hero__title">Memory, wallet, and permissions are user-controlled.</h1>
            <p className="atlas-hero__lede" style={{ color: "rgba(241, 245, 249, 0.76)" }}>
              Atlas gets better over time without taking control away from the user.
            </p>
            <span className="atlas-badge atlas-badge--green">Shopping state: {shoppingStage}</span>
          </div>
        </AtlasCard>
      </section>

      <AtlasSection eyebrow="Wallet" title="Payments stay transparent." description="Every task uses the same controlled payment layer.">
        <div className="atlas-rows">
          {walletRows.map((row) => (
            <div className="atlas-row" key={row.title}>
              <div className="atlas-row__meta">
                <div className="atlas-row__title">{row.title}</div>
                <div className="atlas-row__body">{row.body}</div>
              </div>
              <span className="atlas-micro">{row.meta}</span>
            </div>
          ))}
        </div>
      </AtlasSection>

      <AtlasSection eyebrow="Memory" title="Preferences stay visible and editable." description="Users can inspect or remove anything Atlas remembers.">
        <div className="atlas-grid">
          {memoryGroups.map((group) => (
            <AtlasCard key={group.title}>
              <div className="atlas-card__title">{group.title}</div>
              <div className="atlas-card__body">{group.items.join(" · ")}</div>
            </AtlasCard>
          ))}
        </div>
      </AtlasSection>

      <AtlasSection eyebrow="Connected accounts" title="Connections remain revocable." description="Access should feel safe, temporary, and clear.">
        <div className="atlas-rows">
          {connectedAccounts.map((row) => (
            <div className="atlas-row" key={row.title}>
              <div className="atlas-row__meta">
                <div className="atlas-row__title">{row.title}</div>
                <div className="atlas-row__body">{row.body}</div>
                <div className="atlas-row__body">{row.meta}</div>
              </div>
              <button
                type="button"
                className="atlas-inline-action"
                aria-pressed={row.body === "Connected"}
                onClick={() => toggleConnectedAccount(row.title)}
              >
                {row.body === "Connected" ? "Pause" : "Resume"}
              </button>
            </div>
          ))}
        </div>
      </AtlasSection>

      <AtlasSection eyebrow="Privacy" title="Trust settings should be easy to scan." description="A user should always know what Atlas can see and do.">
        <div className="atlas-rows">
          {privacyControls.map((row) => (
            <div className="atlas-row" key={row.title}>
              <div className="atlas-row__meta">
                <div className="atlas-row__title">{row.title}</div>
                <div className="atlas-row__body">{row.body}</div>
              </div>
              <button
                type="button"
                className="atlas-inline-action"
                aria-pressed={row.body === "Enabled"}
                onClick={() => togglePrivacyControl(row.title)}
              >
                {row.body === "Enabled" ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </div>
      </AtlasSection>
    </div>
  );
}
