import type {
  AtlasCardData,
  AtlasRowData,
  AtlasStepData,
  AtlasTimelineData,
} from "./types";

export const heroChips = [
  "Flights",
  "Food",
  "Hotels",
  "Rides",
  "Shopping",
  "Appointments",
];

export const assistantCapabilities = [
  {
    title: "Flights",
    body: "Book tickets, compare airlines, and explain tradeoffs before approval.",
    accent: "Blue",
  },
  {
    title: "Food",
    body: "Order food from nearby restaurants with live ETA and dietary awareness.",
    accent: "Green",
  },
  {
    title: "Hotels",
    body: "Find stays, compare policies, and keep your trip details organized.",
    accent: "Amber",
  },
  {
    title: "Shopping",
    body: "Compare products, find the right price, and request approval before spending.",
    accent: "Slate",
  },
  {
    title: "Rides",
    body: "Book a ride, track pickup, and keep the route visible the entire time.",
    accent: "Cyan",
  },
  {
    title: "Appointments",
    body: "Schedule visits, coordinate times, and store confirmations automatically.",
    accent: "Violet",
  },
];

export const assistantPrompts = [
  "Book a flight to New York next Friday.",
  "Order chicken biryani from the best nearby restaurant.",
  "Find a hotel near Times Square.",
  "Buy me a gaming laptop under $1800.",
];

export const profileSummary = [
  { title: "Name", body: "Alex Morgan" },
  { title: "Timezone", body: "America/New_York" },
  { title: "Travel style", body: "Aisle seat, nonstop when possible" },
  { title: "Dietary note", body: "Vegetarian-friendly, no shellfish" },
];

export const paymentOptions = [
  { title: "Visa •••• 4242", body: "Default card", meta: "Approved" },
  { title: "Amex •••• 3108", body: "Backup card", meta: "Optional" },
  { title: "Atlas Wallet", body: "Spending limit: $4,000", meta: "Active" },
];

export const bookingHistory = [
  { title: "Flight to San Francisco", body: "Booked yesterday • Receipt saved", meta: "Travel" },
  { title: "Dinner at Sora", body: "Completed tonight • 2 guests", meta: "Food" },
  { title: "Razer Blade 16", body: "Purchased last week • Tracked", meta: "Shopping" },
];

export const problemCards: AtlasCardData[] = [
  {
    title: "Too many apps",
    body: "Travel, shopping, food, rides, and appointments live in separate places with separate flows.",
  },
  {
    title: "Too much repetition",
    body: "Users re-enter the same intent, payment, and preference details again and again.",
  },
  {
    title: "Too much ambiguity",
    body: "Important tradeoffs are hidden behind dense interfaces and long checkout flows.",
  },
  {
    title: "Too little trust",
    body: "Users need clarity before anything is purchased, booked, or committed.",
  },
];

export const whyNowCards: AtlasCardData[] = [
  {
    title: "Smarter models",
    body: "Modern AI can understand intent, compare options, and keep context across steps.",
  },
  {
    title: "Connected services",
    body: "Digital providers now expose enough structure for search, comparison, and execution.",
  },
  {
    title: "Conversational habits",
    body: "Users increasingly prefer describing outcomes instead of learning software syntax.",
  },
  {
    title: "Trusted execution",
    body: "Approval, permissions, and transparent progress make action safe enough to use.",
  },
];

export const trustCards: AtlasCardData[] = [
  {
    title: "No spending without approval",
    body: "Atlas always asks before committing money or reservations.",
  },
  {
    title: "Explainable recommendations",
    body: "Every option shows the reasoning behind the suggestion.",
  },
  {
    title: "User-owned memory",
    body: "Preferences and remembered details stay visible and editable.",
  },
  {
    title: "Revocable access",
    body: "Connected accounts can be paused or removed at any time.",
  },
];

export const platformNodes = [
  { title: "User", body: "Expresses intent once" },
  { title: "Atlas", body: "Coordinates and executes" },
  { title: "Any digital service", body: "Flights, food, rides, shopping, appointments" },
];

export const journeySteps: AtlasStepData[] = [
  { title: "Request", body: "The user says what they want in natural language." },
  { title: "Clarify", body: "Atlas asks only the follow-up questions that matter." },
  { title: "Search", body: "Atlas scans multiple providers and keeps the user updated." },
  { title: "Recommend", body: "Atlas highlights the best options and explains the tradeoffs." },
  { title: "Approve", body: "The user confirms the exact spend or reservation." },
  { title: "Complete", body: "Atlas finalizes the task and records the result." },
  { title: "Track", body: "Atlas follows through with status, reminders, and receipts." },
];

export const serviceCards: AtlasCardData[] = [
  {
    title: "Travel",
    body: "Flights, hotels, airport transfers, and trip follow-through.",
    badge: "High frequency",
  },
  {
    title: "Food",
    body: "Restaurant discovery, delivery, dietary preferences, and ETA tracking.",
    badge: "Time sensitive",
  },
  {
    title: "Rides",
    body: "Ride comparison, pickup coordination, and live tracking.",
    badge: "Immediate",
  },
  {
    title: "Shopping",
    body: "Product comparison, price checks, and purchase approval.",
    badge: "Research heavy",
  },
  {
    title: "Appointments",
    body: "Booking, reminders, and calendar-friendly follow-up.",
    badge: "Commitment based",
  },
  {
    title: "Payments",
    body: "Wallet control, receipts, and transparent spending.",
    badge: "Trust layer",
  },
];

export const futureStages = [
  { title: "Command line", body: "Users learned syntax." },
  { title: "Desktop", body: "Software became visual." },
  { title: "Web", body: "Services became connected." },
  { title: "Mobile apps", body: "Software became personal." },
  { title: "AI assistants", body: "Software began to understand." },
  { title: "AI Personal Assistants", body: "Software can now safely take action." },
];

export const chatStages: AtlasStepData[] = [
  { title: "Intent", body: "Atlas captures the goal in one sentence." },
  { title: "Clarify", body: "Atlas narrows scope without turning into a form." },
  { title: "Search", body: "Atlas checks providers and availability in the background." },
  { title: "Compare", body: "Atlas surfaces the best options visually." },
  { title: "Approve", body: "Atlas shows the final spend and waits for confirmation." },
];

export const activeTasks: AtlasRowData[] = [
  {
    title: "Flight to New York",
    body: "Searching airlines and comparing schedules.",
    meta: "In progress",
  },
  {
    title: "Dinner tonight",
    body: "Reservation confirmed for 7:00 PM.",
    meta: "Confirmed",
  },
  {
    title: "Package delivery",
    body: "Out for delivery with live updates.",
    meta: "Tracking",
  },
];

export const activityTimeline: AtlasTimelineData[] = [
  {
    time: "10:30 AM",
    title: "Meeting confirmed",
    body: "Atlas added the event to your calendar and shared the details.",
  },
  {
    time: "9:15 AM",
    title: "Reservation updated",
    body: "Atlas checked availability and refreshed the booking summary.",
  },
  {
    time: "8:45 AM",
    title: "Delivery arrived",
    body: "Atlas marked the package as complete and saved the receipt.",
  },
];

export const notifications = [
  {
    title: "Flight price dropped",
    body: "Your New York fare is down by $48. Review the new options.",
    action: "Review options",
  },
  {
    title: "Driver arriving",
    body: "Your ride is 3 minutes away and approaching pickup.",
    action: "Track ride",
  },
  {
    title: "Order arriving",
    body: "Dinner is out for delivery and should arrive at 7:18 PM.",
    action: "View order",
  },
];

export const walletRows = [
  { title: "Primary card", body: "Visa ending 4242", meta: "Default" },
  { title: "Spending limit", body: "$4,000 per task", meta: "Editable" },
  { title: "Receipts", body: "All confirmations stored automatically", meta: "Auto-saved" },
];

export const memoryGroups = [
  {
    title: "Travel preferences",
    items: ["Aisle seat", "Nonstop when possible", "Business class for work travel"],
  },
  {
    title: "Food preferences",
    items: ["Vegetarian-friendly", "Spicy dishes preferred", "No shellfish"],
  },
  {
    title: "Shopping preferences",
    items: ["Trusted brands", "Budget reminders", "Fast shipping"],
  },
];

export const connectedAccounts = [
  { title: "Google Calendar", body: "Connected", meta: "Events and reminders" },
  { title: "Gmail", body: "Connected", meta: "Receipts and confirmations" },
  { title: "Uber", body: "Connected", meta: "Rides and ETA updates" },
  { title: "Dropbox", body: "Connected", meta: "Files and documents" },
];

export const privacyControls = [
  { title: "Memory and personalization", body: "Enabled" },
  { title: "Activity tracking", body: "Enabled" },
  { title: "Recommendation data", body: "Limited" },
  { title: "Marketing communications", body: "Disabled" },
];
