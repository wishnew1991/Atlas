"use client";

import { AtlasCard } from "./atlas-card";
import {
  assistantCapabilities,
  bookingHistory,
  connectedAccounts,
  paymentOptions,
  profileSummary,
  privacyControls,
} from "@/lib/atlas/content";
import { atlasMcpProviders } from "@/lib/atlas/mcp-registry";
import { activeTasks, activityTimeline } from "@/lib/atlas/content";

interface AssistantSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AssistantSettingsDrawer({ open, onClose }: AssistantSettingsDrawerProps) {
  return (
    <>
      <button
        type="button"
        className="atlas-drawer-overlay"
        data-open={open ? "true" : "false"}
        hidden={!open}
        aria-label="Close settings"
        aria-hidden={!open}
        onClick={onClose}
      />

      <aside
        className="atlas-settings-drawer"
        data-open={open ? "true" : "false"}
        hidden={!open}
        aria-hidden={!open}
      >
        <div className="atlas-settings-drawer__sheet">
          <div className="atlas-settings-drawer__top">
            <div>
              <p className="atlas-hero__subtle">Settings</p>
              <h2 className="atlas-settings-drawer__title">Control center</h2>
              <p className="atlas-settings-drawer__copy">
                Add MCPs, manage wallets, review history, and keep Atlas under
                your control.
              </p>
            </div>
            <button type="button" className="atlas-action atlas-action--ghost atlas-settings-drawer__close" onClick={onClose}>
              Close
            </button>
          </div>

          <AtlasCard tone="soft" className="atlas-settings-drawer__card">
            <div className="atlas-mini-row">
              <div>
                <div className="atlas-card__eyebrow">MCPs</div>
                <div className="atlas-card__title">Add or manage providers</div>
              </div>
              <button type="button" className="atlas-action atlas-action--primary atlas-settings-drawer__inline-action">
                Add MCP
              </button>
            </div>
            <div className="atlas-rows">
              {atlasMcpProviders.map((provider) => (
                <div className="atlas-row" key={provider.id}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">{provider.name}</div>
                    <div className="atlas-row__body">{provider.role}</div>
                    <div className="atlas-row__body">{provider.source}</div>
                  </div>
                  <span className={`atlas-badge ${provider.readiness === "ready" ? "atlas-badge--green" : provider.readiness === "partial" ? "atlas-badge--amber" : "atlas-badge--red"}`}>
                    {provider.readiness}
                  </span>
                </div>
              ))}
            </div>
          </AtlasCard>

          <AtlasCard className="atlas-settings-drawer__card">
            <div className="atlas-card__eyebrow">Payment methods</div>
            <div className="atlas-card__title">Wallets, cards, and spend limits</div>
            <div className="atlas-rows">
              {paymentOptions.map((item) => (
                <div className="atlas-row" key={item.title}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">{item.title}</div>
                    <div className="atlas-row__body">{item.body}</div>
                  </div>
                  <span className="atlas-micro">{item.meta}</span>
                </div>
              ))}
            </div>
          </AtlasCard>

          <AtlasCard tone="soft" className="atlas-settings-drawer__card">
            <div className="atlas-card__eyebrow">Profile</div>
            <div className="atlas-card__title">User details and memory</div>
            <div className="atlas-rows">
              {profileSummary.map((item) => (
                <div className="atlas-row" key={item.title}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">{item.title}</div>
                    <div className="atlas-row__body">{item.body}</div>
                  </div>
                  <span className="atlas-badge atlas-badge--blue">Edit</span>
                </div>
              ))}
            </div>
            <div className="atlas-chip-row">
              {connectedAccounts.map((item) => (
                <span key={item.title} className="atlas-chip atlas-chip--quiet">
                  {item.title}
                </span>
              ))}
            </div>
          </AtlasCard>

          <AtlasCard className="atlas-settings-drawer__card">
            <div className="atlas-card__eyebrow">History</div>
            <div className="atlas-card__title">Bookings and recent tasks</div>
            <div className="atlas-rows">
              {bookingHistory.map((item) => (
                <div className="atlas-row" key={item.title}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">{item.title}</div>
                    <div className="atlas-row__body">{item.body}</div>
                  </div>
                  <span className="atlas-badge atlas-badge--green">{item.meta}</span>
                </div>
              ))}
              {activeTasks.map((task) => (
                <div className="atlas-row" key={task.title}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">{task.title}</div>
                    <div className="atlas-row__body">{task.body}</div>
                  </div>
                  <span className="atlas-micro">{task.meta}</span>
                </div>
              ))}
            </div>
          </AtlasCard>

          <AtlasCard tone="soft" className="atlas-settings-drawer__card">
            <div className="atlas-card__eyebrow">Privacy</div>
            <div className="atlas-card__title">Permissions and data control</div>
            <div className="atlas-rows">
              {privacyControls.map((item) => (
                <div className="atlas-row" key={item.title}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">{item.title}</div>
                    <div className="atlas-row__body">{item.body}</div>
                  </div>
                  <span className="atlas-badge atlas-badge--amber">Manage</span>
                </div>
              ))}
            </div>
          </AtlasCard>

          <AtlasCard className="atlas-settings-drawer__card">
            <div className="atlas-card__eyebrow">Capabilities</div>
            <div className="atlas-card__title">What Atlas can do</div>
            <div className="atlas-chip-row">
              {assistantCapabilities.map((item) => (
                <span key={item.title} className="atlas-chip">
                  {item.title}
                </span>
              ))}
            </div>
            <div className="atlas-quote">
              Atlas only executes after approval. The drawer is where you connect
              providers, not where Atlas spends money.
            </div>
            <div className="atlas-timeline">
              {activityTimeline.map((item) => (
                <div className="atlas-timeline__item" key={item.title}>
                  <div className="atlas-timeline__time">{item.time}</div>
                  <div className="atlas-timeline__title">{item.title}</div>
                  <div className="atlas-timeline__body">{item.body}</div>
                </div>
              ))}
            </div>
          </AtlasCard>
        </div>
      </aside>
    </>
  );
}
