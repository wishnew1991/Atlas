"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AtlasCard } from "./atlas-card";
import { IntegrationAvatar } from "@/components/atlas/integration-avatar";
import {
  assistantCapabilities,
  bookingHistory,
  paymentOptions,
  profileSummary,
  privacyControls,
} from "@/lib/atlas/content";
import { activeTasks, activityTimeline } from "@/lib/atlas/content";

interface AssistantSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface ConnectionSummary {
  integrationId: string;
  integrationName: string;
  status: string;
  capabilities: string[];
}

export function AssistantSettingsDrawer({ open, onClose }: AssistantSettingsDrawerProps) {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);

  const loadConnections = useCallback(async () => {
    try {
      const response = await fetch("/api/user/connections");
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.connections)) {
        setConnections(payload.connections);
      }
    } catch { /* best effort */ }
  }, []);

  useEffect(() => {
    if (open) void loadConnections();
  }, [open, loadConnections]);

  const connectedCount = connections.filter((c) => c.status === "active").length;
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
                Manage payments, review history, and keep Atlas under your control.
              </p>
            </div>
            <button type="button" className="atlas-action atlas-action--ghost atlas-settings-drawer__close" onClick={onClose}>
              Close
            </button>
          </div>

          <AtlasCard tone="soft" className="atlas-settings-drawer__card">
            <div className="atlas-mini-row">
              <div>
                <div className="atlas-card__eyebrow">Connections</div>
                <div className="atlas-card__title">
                  {connectedCount > 0 ? `${connectedCount} service${connectedCount !== 1 ? "s" : ""} connected` : "No services connected"}
                </div>
              </div>
            </div>
            {connections.length > 0 ? (
              <div className="atlas-rows">
                {connections.map((conn) => (
                  <div className="atlas-row" key={conn.integrationId}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      <IntegrationAvatar integrationId={conn.integrationId} name={conn.integrationName} size="sm" decorative />
                      <div className="atlas-row__meta">
                        <div className="atlas-row__title">{conn.integrationName}</div>
                        <div className="atlas-row__body">{conn.capabilities.join(", ")}</div>
                      </div>
                    </div>
                    <span className={`atlas-badge ${conn.status === "active" ? "atlas-badge--green" : "atlas-badge--red"}`}>
                      {conn.status === "active" ? "Connected" : conn.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="atlas-card__body" style={{ marginTop: 4 }}>Connect services like Swiggy, Amazon, or Google from your Profile.</div>
            )}
            <div className="atlas-chip-row" style={{ marginTop: 12 }}>
              <Link href="/profile" className="atlas-action atlas-action--primary atlas-action--small" onClick={onClose}>
                Manage connections →
              </Link>
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
