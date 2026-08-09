"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { ConnectionsSection } from "./connections-section";
import { useToast } from "@/components/ui/ToastProvider";

type ProfileAddress = { id: string; label: string; line: string };
type ProfilePayment = { id: string; kind: "upi" | "card"; label: string; value: string };
type ProfilePrivacy = { saveMemory: boolean; useLocation: boolean; shareAnalytics: boolean };
type ProfileMemory = { id: string; type: string; text: string; updatedAt: string };

type ProfileSnapshot = {
  name: string;
  phone: string;
  email: string;
  addresses: ProfileAddress[];
  payments: ProfilePayment[];
  privacy: ProfilePrivacy;
  memories: ProfileMemory[];
};

const EMPTY: ProfileSnapshot = {
  name: "",
  phone: "",
  email: "",
  addresses: [],
  payments: [],
  privacy: { saveMemory: true, useLocation: true, shareAnalytics: false },
  memories: [],
};

function initialsFor(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  const local = email.trim().split("@")[0] || "";
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return "A";
}

export function ProfileBoard() {
  const router = useRouter();
  const { addToast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [profile, setProfile] = useState<ProfileSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [addressLabel, setAddressLabel] = useState("Home");
  const [addressLine, setAddressLine] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);

  const [paymentKind, setPaymentKind] = useState<"upi" | "card">("upi");
  const [paymentLabel, setPaymentLabel] = useState("");
  const [paymentValue, setPaymentValue] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);

  const [memoryText, setMemoryText] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);

  const applyProfile = useCallback((next: ProfileSnapshot) => {
    setProfile(next);
    setName(next.name);
    setPhone(next.phone);
    setEmail(next.email);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (err) {
        throw new Error(!response.ok ? "Server error." : "Invalid JSON response.");
      }
      if (!response.ok) {
        const detail =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Could not load profile.";
        throw new Error(detail);
      }
      const next =
        typeof payload === "object" &&
        payload !== null &&
        typeof (payload as { profile?: unknown }).profile === "object" &&
        (payload as { profile: ProfileSnapshot }).profile
          ? (payload as { profile: ProfileSnapshot }).profile
          : EMPTY;
      applyProfile(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (err) {
        throw new Error(!response.ok ? "Server error." : "Invalid JSON response.");
      }
      if (!response.ok) {
        const detail =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Could not save.";
        throw new Error(detail);
      }
      const next =
        typeof payload === "object" &&
        payload !== null &&
        typeof (payload as { profile?: unknown }).profile === "object" &&
        (payload as { profile: ProfileSnapshot }).profile
          ? (payload as { profile: ProfileSnapshot }).profile
          : profile;
      applyProfile(next);
      addToast("Saved");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const detailsDirty =
    name.trim() !== profile.name ||
    phone.trim() !== profile.phone ||
    email.trim() !== profile.email;

  const displayName = profile.name.trim() || "Your profile";
  const initials = initialsFor(profile.name || name, profile.email || email);
  const contactLine = [profile.email, profile.phone].filter(Boolean).join(" · ");

  const saveYou = (event: FormEvent) => {
    event.preventDefault();
    void (async () => {
      const ok = await patch({ name, phone, email });
      if (ok) setEditingDetails(false);
    })();
  };

  const cancelEditDetails = () => {
    setName(profile.name);
    setPhone(profile.phone);
    setEmail(profile.email);
    setEditingDetails(false);
  };

  const addAddress = (event: FormEvent) => {
    event.preventDefault();
    void (async () => {
      const ok = await patch({ op: "add_address", label: addressLabel, line: addressLine });
      if (ok) {
        setAddressLine("");
        setAddingAddress(false);
      }
    })();
  };

  const addPayment = (event: FormEvent) => {
    event.preventDefault();
    void (async () => {
      const ok = await patch({
        op: "add_payment",
        kind: paymentKind,
        label: paymentLabel || (paymentKind === "upi" ? "UPI" : "Card"),
        value: paymentValue,
      });
      if (ok) {
        setPaymentValue("");
        setPaymentLabel("");
        setAddingPayment(false);
      }
    })();
  };

  const addMemory = (event: FormEvent) => {
    event.preventDefault();
    void (async () => {
      const ok = await patch({ op: "add_memory", text: memoryText, type: "preference" });
      if (ok) {
        setMemoryText("");
        setAddingMemory(false);
      }
    })();
  };

  if (loading) {
    return (
      <div className="atlas-page atlas-page--board atlas-profile">
        <div className="atlas-profile__skeleton" aria-hidden="true">
          <div className="atlas-profile__skeleton-hero">
            <span />
            <div>
              <em />
              <em />
            </div>
          </div>
          <div className="atlas-profile__skeleton-block">
            <em />
            <span />
          </div>
          <div className="atlas-profile__skeleton-block">
            <em />
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="atlas-page atlas-page--board atlas-profile">
      <header className="atlas-profile-hero">
        <div className="atlas-profile-hero__avatar" aria-hidden="true">
          {initials}
        </div>
        <div className="atlas-profile-hero__copy">
          <p className="atlas-profile-hero__eyebrow">Profile</p>
          <h1 className="atlas-profile-hero__title">{displayName}</h1>
          <p className="atlas-profile-hero__lede">
            {contactLine || "Addresses, payments, and what Atlas should remember."}
          </p>
        </div>
        <div className="atlas-profile-hero__aside">
          <button
            type="button"
            className="atlas-action atlas-action--ghost atlas-profile-hero__refresh"
            disabled={saving}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="atlas-action atlas-action--ghost atlas-profile-hero__signout"
            disabled={signingOut}
            onClick={async () => {
              if (signingOut) return;
              setSigningOut(true);
              try {
                await authClient.signOut();
              } catch {
                /* sign out still proceeds client-side */
              }
              
              // Drop the cached profile name cookie
              document.cookie = "atlas-user-name=; path=/; max-age=0";

              // Clear chat session artifacts so the new user starts fresh.
              try {
                localStorage.removeItem("atlas-conversation-id");
                localStorage.removeItem("atlas-tts-muted");
              } catch {
                /* localStorage may be unavailable */
              }
              router.push("/sign-in");
              router.refresh();
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      {error ? (
        <p className="atlas-board-empty atlas-board-empty--error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="atlas-profile-block">
        <div className="atlas-profile-block__head">
          <div>
            <h2 className="atlas-profile-block__title">Details</h2>
            <p className="atlas-profile-block__lede">From your account — edit anytime.</p>
          </div>
          {!editingDetails ? (
            <button
              type="button"
              className="atlas-inline-action"
              disabled={saving}
              onClick={() => setEditingDetails(true)}
            >
              Edit
            </button>
          ) : null}
        </div>

        {editingDetails ? (
          <form className="atlas-profile-composer" onSubmit={saveYou}>
            <label className="atlas-profile-field">
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
            </label>
            <div className="atlas-profile-form__row">
              <label className="atlas-profile-field">
                <span>Phone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 …"
                  inputMode="tel"
                />
              </label>
              <label className="atlas-profile-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            </div>
            <div className="atlas-profile-form__actions">
              <button
                type="button"
                className="atlas-action atlas-action--ghost"
                disabled={saving}
                onClick={cancelEditDetails}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="atlas-action atlas-action--primary"
                disabled={saving || !detailsDirty}
              >
                Save details
              </button>
            </div>
          </form>
        ) : (
          <ul className="atlas-profile-list atlas-profile-list--details">
            {(
              [
                ["Name", profile.name],
                ["Email", profile.email],
                ["Phone", profile.phone],
              ] as const
            ).map(([label, value]) => (
              <li className="atlas-profile-list__item" key={label}>
                <div className="atlas-profile-list__meta">
                  <span className="atlas-profile-list__body">{label}</span>
                  <span className="atlas-profile-list__title">
                    {value.trim() || <span className="atlas-profile-empty-inline">Not set</span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="atlas-profile-block">
        <div className="atlas-profile-block__head">
          <div>
            <h2 className="atlas-profile-block__title">Addresses</h2>
            <p className="atlas-profile-block__lede">Saved places for delivery and bookings.</p>
          </div>
          {!addingAddress ? (
            <button
              type="button"
              className="atlas-inline-action"
              disabled={saving}
              onClick={() => setAddingAddress(true)}
            >
              Add
            </button>
          ) : null}
        </div>

        {profile.addresses.length === 0 && !addingAddress ? (
          <p className="atlas-profile-empty">No saved addresses yet.</p>
        ) : (
          <ul className="atlas-profile-list">
            {profile.addresses.map((address) => (
              <li className="atlas-profile-list__item" key={address.id}>
                <div className="atlas-profile-list__meta">
                  <span className="atlas-profile-list__title">{address.label}</span>
                  <span className="atlas-profile-list__body">{address.line}</span>
                </div>
                <button
                  type="button"
                  className="atlas-profile-list__remove"
                  disabled={saving}
                  onClick={() => void patch({ op: "delete_address", addressId: address.id })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {addingAddress ? (
          <form className="atlas-profile-composer" onSubmit={addAddress}>
            <label className="atlas-profile-field">
              <span>Label</span>
              <input value={addressLabel} onChange={(e) => setAddressLabel(e.target.value)} />
            </label>
            <label className="atlas-profile-field">
              <span>Address</span>
              <input
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Street, area, city"
                required
                autoFocus
              />
            </label>
            <div className="atlas-profile-form__actions">
              <button
                type="button"
                className="atlas-action atlas-action--ghost"
                disabled={saving}
                onClick={() => {
                  setAddingAddress(false);
                  setAddressLine("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className="atlas-action atlas-action--primary" disabled={saving}>
                Save address
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="atlas-profile-block">
        <div className="atlas-profile-block__head">
          <div>
            <h2 className="atlas-profile-block__title">Payments</h2>
            <p className="atlas-profile-block__lede">
              UPI IDs or card labels for checkout. Full card numbers are never stored.
            </p>
          </div>
          {!addingPayment ? (
            <button
              type="button"
              className="atlas-inline-action"
              disabled={saving}
              onClick={() => setAddingPayment(true)}
            >
              Add
            </button>
          ) : null}
        </div>

        {profile.payments.length === 0 && !addingPayment ? (
          <p className="atlas-profile-empty">No payment methods yet.</p>
        ) : (
          <ul className="atlas-profile-list">
            {profile.payments.map((payment) => (
              <li className="atlas-profile-list__item" key={payment.id}>
                <div className="atlas-profile-list__meta">
                  <span className="atlas-profile-list__title">
                    {payment.label}
                    <span className="atlas-badge atlas-badge--blue">
                      {payment.kind === "upi" ? "UPI" : "Card"}
                    </span>
                  </span>
                  <span className="atlas-profile-list__body">{payment.value}</span>
                </div>
                <button
                  type="button"
                  className="atlas-profile-list__remove"
                  disabled={saving}
                  onClick={() => void patch({ op: "delete_payment", paymentId: payment.id })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {addingPayment ? (
          <form className="atlas-profile-composer" onSubmit={addPayment}>
            <div className="atlas-profile-form__row">
              <label className="atlas-profile-field">
                <span>Type</span>
                <select
                  value={paymentKind}
                  onChange={(e) => setPaymentKind(e.target.value === "card" ? "card" : "upi")}
                >
                  <option value="upi">UPI</option>
                  <option value="card">Card (last 4)</option>
                </select>
              </label>
              <label className="atlas-profile-field">
                <span>Label</span>
                <input
                  value={paymentLabel}
                  onChange={(e) => setPaymentLabel(e.target.value)}
                  placeholder={paymentKind === "upi" ? "GPay" : "Visa"}
                />
              </label>
            </div>
            <label className="atlas-profile-field">
              <span>{paymentKind === "upi" ? "UPI ID" : "Card mask"}</span>
              <input
                value={paymentValue}
                onChange={(e) => setPaymentValue(e.target.value)}
                placeholder={paymentKind === "upi" ? "name@okaxis" : "Visa ···· 4242"}
                required
                autoFocus
              />
            </label>
            <div className="atlas-profile-form__actions">
              <button
                type="button"
                className="atlas-action atlas-action--ghost"
                disabled={saving}
                onClick={() => {
                  setAddingPayment(false);
                  setPaymentValue("");
                  setPaymentLabel("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className="atlas-action atlas-action--primary" disabled={saving}>
                Save method
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="atlas-profile-block">
        <div className="atlas-profile-block__head">
          <div>
            <h2 className="atlas-profile-block__title">Memory</h2>
            <p className="atlas-profile-block__lede">
              Preferences Atlas should keep — add or forget anything here.
            </p>
          </div>
          {!addingMemory ? (
            <button
              type="button"
              className="atlas-inline-action"
              disabled={saving}
              onClick={() => setAddingMemory(true)}
            >
              Add
            </button>
          ) : null}
        </div>

        {profile.memories.length === 0 && !addingMemory ? (
          <p className="atlas-profile-empty">No memories yet.</p>
        ) : (
          <ul className="atlas-profile-list">
            {profile.memories.map((memory) => (
              <li className="atlas-profile-list__item" key={memory.id}>
                <div className="atlas-profile-list__meta">
                  <span className="atlas-profile-list__title">{memory.text}</span>
                  <span className="atlas-profile-list__body">{memory.type}</span>
                </div>
                <button
                  type="button"
                  className="atlas-profile-list__remove"
                  disabled={saving}
                  onClick={() => void patch({ op: "delete_memory", memoryId: memory.id })}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}

        {addingMemory ? (
          <form className="atlas-profile-composer" onSubmit={addMemory}>
            <label className="atlas-profile-field">
              <span>Preference</span>
              <input
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
                placeholder="e.g. Prefer less spicy food"
                required
                autoFocus
              />
            </label>
            <div className="atlas-profile-form__actions">
              <button
                type="button"
                className="atlas-action atlas-action--ghost"
                disabled={saving}
                onClick={() => {
                  setAddingMemory(false);
                  setMemoryText("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className="atlas-action atlas-action--primary" disabled={saving}>
                Save memory
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <ConnectionsSection />

      <section className="atlas-profile-block">
        <div className="atlas-profile-block__head">
          <div>
            <h2 className="atlas-profile-block__title">Privacy</h2>
            <p className="atlas-profile-block__lede">Control what Atlas keeps and uses.</p>
          </div>
        </div>
        <ul className="atlas-profile-list atlas-profile-list--toggles">
          {(
            [
              ["saveMemory", "Save memory", "Keep preferences from chats"],
              ["useLocation", "Use location", "Delivery and nearby search"],
              ["shareAnalytics", "Share analytics", "Anonymous product analytics"],
            ] as const
          ).map(([key, title, body]) => (
            <li className="atlas-profile-list__item" key={key}>
              <div className="atlas-profile-list__meta">
                <span className="atlas-profile-list__title">{title}</span>
                <span className="atlas-profile-list__body">{body}</span>
              </div>
              <button
                type="button"
                className="atlas-toggle"
                role="switch"
                aria-checked={profile.privacy[key]}
                aria-label={title}
                disabled={saving}
                onClick={() =>
                  void patch({
                    privacy: { [key]: !profile.privacy[key] },
                  })
                }
              >
                <span className="atlas-toggle__thumb" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
