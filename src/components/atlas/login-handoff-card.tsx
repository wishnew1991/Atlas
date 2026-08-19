"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { IntegrationAvatar } from "@/components/atlas/integration-avatar";

const QR_SIZE = 176;

/**
 * Reusable browser login-handoff card.
 *
 * For connector transports that need a real browser session (OAuth or browser
 * automation), the flow is: Atlas sends a one-time login link, the user opens
 * it (or scans the QR), completes sign-in on the provider's site, and Atlas
 * picks up the resulting session automatically.
 *
 * This card renders the QR + link, copies the link, and exposes a "done"
 * callback so the parent can poll/refresh the connection state.
 */
export function LoginHandoffCard({
  integrationId,
  name,
  handoffUrl,
  expiresAt,
  onCancel,
  onComplete,
}: {
  integrationId: string;
  name: string;
  handoffUrl: string;
  expiresAt?: string | null;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrError, setQrError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [donePing, setDonePing] = useState(false);

  useEffect(() => {
    if (!handoffUrl || !canvasRef.current) return;
    let cancelled = false;
    void QRCode.toCanvas(canvasRef.current, handoffUrl, {
      width: QR_SIZE,
      margin: 1,
      color: { dark: "#0b0f14", light: "#ffffff" },
    })
      .then(() => {
        if (cancelled) return;
        setQrError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [handoffUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(handoffUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const expiry = expiresAt ? new Date(expiresAt) : null;
  const expired = expiry ? expiry.getTime() <= Date.now() : false;

  return (
    <div className="atlas-handoff" role="status">
      <div className="atlas-handoff__head">
        <IntegrationAvatar integrationId={integrationId} name={name} size="md" decorative />
        <div className="atlas-handoff__head-meta">
          <span className="atlas-handoff__title">Finish sign-in</span>
          <span className="atlas-handoff__subtitle">
            {name} requires a browser login to stay connected.
          </span>
        </div>
      </div>

      <div className="atlas-handoff__panel">
        <div className="atlas-handoff__qr">
          <canvas ref={canvasRef} className="atlas-handoff__qr-canvas" aria-hidden="true" />
          {qrError ? (
            <span className="atlas-handoff__qr-fallback" aria-hidden="true">
              {name.slice(0, 1)}
            </span>
          ) : null}
        </div>
        <div className="atlas-handoff__actions">
          <button type="button" className="atlas-action atlas-action--primary" onClick={copyLink}>
            {copied ? "Copied" : "Copy login link"}
          </button>
          <a className="atlas-action atlas-action--ghost" href={handoffUrl} target="_blank" rel="noreferrer">
            Open link
          </a>
        </div>
        {expired ? (
          <p className="atlas-handoff__expiry atlas-handoff__expiry--expired">
            This handoff has expired. Cancel and try again.
          </p>
        ) : (
          <p className="atlas-handoff__expiry">
            Scans on the next device (or tap the link). Link expires in 5 minutes.
          </p>
        )}
      </div>

      <div className="atlas-handoff__foot">
        <button
          type="button"
          className="atlas-action atlas-action--primary"
          onClick={() => {
            setDonePing(true);
            onComplete();
          }}
        >
          {donePing ? "Checking…" : "I've finished signing in"}
        </button>
        <button type="button" className="atlas-action atlas-action--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}