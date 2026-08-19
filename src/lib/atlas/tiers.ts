/** Client-safe tier metadata. Server-side plans live in @/lib/atlas/server/tiers. */

export type TierId = "free" | "premium" | "vip";

export const TIER_IDS: TierId[] = ["free", "premium", "vip"];

export const TIER_META: Record<TierId, { label: string; blurb: string }> = {
  free: { label: "Free", blurb: "Core assistant, no voice." },
  premium: { label: "Standard", blurb: "Faster replies and voice chat." },
  vip: { label: "VIP", blurb: "Unlimited everything." },
};

export const TIER_PLANS: Record<
  TierId,
  { name: string; price: string; priceInr: number; perks: string[]; cta: string }
> = {
  free: {
    name: "Free",
    price: "₹0",
    priceInr: 0,
    perks: ["20 requests/min", "50k tokens/day", "Text-only replies"],
    cta: "Current plan",
  },
  premium: {
    name: "Standard",
    price: "₹99/mo",
    priceInr: 99,
    perks: ["60 requests/min", "150k tokens/day", "30 voice minutes/day", "Instant replies"],
    cta: "Upgrade to Standard",
  },
  vip: {
    name: "VIP",
    price: "₹299/mo",
    priceInr: 299,
    perks: ["120 requests/min", "500k tokens/day", "Unlimited voice", "Priority support"],
    cta: "Upgrade to VIP",
  },
};

/** Demo UPI merchant the intent link points at. Replace with the live PSP VPA in production. */
export const UPI_MERCHANT_VPA = "atlas@okicici";
export const UPI_MERCHANT_NAME = "Atlas";
export const CURRENCY = "INR";