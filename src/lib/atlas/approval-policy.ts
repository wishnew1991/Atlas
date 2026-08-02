import type { AtlasDomain, AtlasApprovalTrigger } from "./mcp-registry";

export interface AtlasApprovalField {
  label: string;
  value: string;
}

export interface AtlasApprovalPolicy {
  domain: AtlasDomain;
  trigger: AtlasApprovalTrigger;
  title: string;
  fields: AtlasApprovalField[];
  primaryAction: string;
  secondaryAction: string;
  trustNote: string;
}

export const atlasApprovalPolicies: Record<AtlasDomain, AtlasApprovalPolicy> = {
  shopping: {
    domain: "shopping",
    trigger: "before_spend",
    title: "Approve purchase",
    fields: [
      { label: "Provider", value: "Merchant / marketplace" },
      { label: "Item", value: "Product name and variant" },
      { label: "Price", value: "Subtotal, taxes, shipping" },
      { label: "Payment", value: "Default wallet method" },
      { label: "Policy", value: "Return and cancellation terms" },
    ],
    primaryAction: "Approve purchase",
    secondaryAction: "Cancel",
    trustNote: "Atlas never commits money without explicit approval.",
  },
  travel: {
    domain: "travel",
    trigger: "before_booking",
    title: "Approve booking",
    fields: [
      { label: "Provider", value: "Airline, hotel, or transfer" },
      { label: "Trip", value: "Dates and itinerary summary" },
      { label: "Price", value: "Base fare, fees, taxes" },
      { label: "Payment", value: "Default wallet method" },
      { label: "Policy", value: "Cancellation and change terms" },
    ],
    primaryAction: "Approve booking",
    secondaryAction: "Cancel",
    trustNote: "Atlas asks before any reservation is finalized.",
  },
  food: {
    domain: "food",
    trigger: "before_spend",
    title: "Approve order",
    fields: [
      { label: "Provider", value: "Restaurant or delivery partner" },
      { label: "Order", value: "Items and customizations" },
      { label: "Price", value: "Subtotal, taxes, fees, tip" },
      { label: "Payment", value: "Default wallet method" },
      { label: "ETA", value: "Estimated delivery or pickup" },
    ],
    primaryAction: "Approve order",
    secondaryAction: "Cancel",
    trustNote: "Atlas should wait for confirmation before placing the order.",
  },
  rides: {
    domain: "rides",
    trigger: "before_booking",
    title: "Approve ride",
    fields: [
      { label: "Provider", value: "Ride or transfer partner" },
      { label: "Route", value: "Pickup and destination" },
      { label: "Price", value: "Estimate and surge conditions" },
      { label: "Payment", value: "Default wallet method" },
      { label: "ETA", value: "Driver or vehicle arrival" },
    ],
    primaryAction: "Approve ride",
    secondaryAction: "Cancel",
    trustNote: "Atlas waits until the user confirms the fare and route.",
  },
  appointments: {
    domain: "appointments",
    trigger: "before_booking",
    title: "Approve appointment",
    fields: [
      { label: "Provider", value: "Clinic, salon, or service partner" },
      { label: "Time", value: "Selected slot and timezone" },
      { label: "Price", value: "Deposit or service fee" },
      { label: "Payment", value: "Default wallet method" },
      { label: "Policy", value: "Reschedule and cancellation terms" },
    ],
    primaryAction: "Approve appointment",
    secondaryAction: "Cancel",
    trustNote: "Atlas confirms the slot before creating the booking.",
  },
  payments: {
    domain: "payments",
    trigger: "before_spend",
    title: "Approve payment",
    fields: [
      { label: "Wallet", value: "Selected payment method" },
      { label: "Amount", value: "Final amount" },
      { label: "Reason", value: "What Atlas is paying for" },
      { label: "Receipt", value: "Stored in Activity" },
      { label: "Control", value: "Revocable permissions" },
    ],
    primaryAction: "Approve payment",
    secondaryAction: "Cancel",
    trustNote: "The wallet is always separate from the recommendation layer.",
  },
};

