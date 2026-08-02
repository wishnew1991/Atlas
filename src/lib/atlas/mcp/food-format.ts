import "server-only";

import type {
  FoodCartLine,
  FoodMenuItem,
  FoodRestaurant,
  FoodSession,
  FoodTotals,
} from "@/lib/atlas/mcp/food-session";

// Presentation helpers. These produce the conversational text Atlas shows the
// user — deliberately compact, scannable, and close to the native Swiggy app.

export function rupees(value: number | undefined): string {
  if (value === undefined) return "—";
  const rounded = Math.round(value * 100) / 100;
  return `₹${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

export function formatAddressList(session: FoodSession): string {
  const lines = session.addressOptions.map((address) => {
    const label = address.tag ? `**${address.tag}** — ` : "";
    return `${address.index}. ${label}${truncate(address.line, 70)}`;
  });

  return `Where should I deliver?\n\n${lines.join("\n")}\n\nReply with a number, or the name of the place.`;
}

/**
 * Restaurant cards: name, rating, ETA, price, and availability — the fields the
 * brief calls for, in a single scannable line each.
 */
export function formatRestaurantList(restaurants: FoodRestaurant[], dish: string): string {
  if (restaurants.length === 0) {
    return `I couldn't find anywhere delivering ${dish} to that address right now. Want me to try a different dish or cuisine?`;
  }

  const lines = restaurants.map((restaurant) => {
    const bits: string[] = [];
    if (restaurant.rating !== undefined) bits.push(`⭐${restaurant.rating}`);
    if (restaurant.etaMinutes !== undefined) bits.push(`${restaurant.etaMinutes} min`);
    if (restaurant.costForTwo) bits.push(restaurant.costForTwo.replace(/\s*for two$/i, " for two"));

    const cuisines = restaurant.cuisines.slice(0, 3).join(", ");
    const closed = restaurant.isOpen
      ? ""
      : ` _(closed${restaurant.nextOpenTime ? ` · ${restaurant.nextOpenTime}` : ""})_`;

    return `${restaurant.index}. **${restaurant.name}** ${bits.join(" • ")}${cuisines ? `\n   ${cuisines}` : ""}${closed}`;
  });

  return `Here's what's delivering ${dish} near you:\n\n${lines.join("\n")}\n\nWhich one would you like?`;
}

function itemLine(item: FoodMenuItem): string {
  const marks: string[] = [];
  if (item.isVeg === true) marks.push("🟢");
  if (item.isVeg === false) marks.push("🔴");

  const tags: string[] = [];
  if (item.isBestseller) tags.push("Bestseller");
  if (item.rating) tags.push(`⭐${item.rating}`);
  if (!item.inStock) tags.push("Sold out");

  const prefix = marks.length ? `${marks.join("")} ` : "";
  const suffix = tags.length ? ` _(${tags.join(" · ")})_` : "";

  return `${item.index}. ${prefix}${item.name} — ${rupees(item.price)}${suffix}`;
}

/** Menu grouped by category, with veg/non-veg, price, popularity and availability. */
export function formatMenu(session: FoodSession, items: FoodMenuItem[]): string {
  const name = session.restaurant?.name ?? "this restaurant";

  if (items.length === 0) {
    return `I couldn't load the menu for ${name}. Want to try another restaurant?`;
  }

  const byCategory = new Map<string, FoodMenuItem[]>();
  for (const item of items) {
    const key = item.category ?? "Menu";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(item);
    else byCategory.set(key, [item]);
  }

  const sections: string[] = [];
  byCategory.forEach((categoryItems, category) => {
    sections.push(`**${category}**\n${categoryItems.map(itemLine).join("\n")}`);
  });

  const header = session.restaurant
    ? `**${name}**${session.restaurant.rating !== undefined ? ` ⭐${session.restaurant.rating}` : ""}${session.restaurant.etaMinutes !== undefined ? ` • ${session.restaurant.etaMinutes} min` : ""}`
    : name;

  const more = session.menuPage?.hasMore
    ? `\n\n_More categories available — say "show more" to see the rest._`
    : "";

  return `${header}\n\n${sections.join("\n\n")}${more}\n\nTell me what you'd like to add.`;
}

export function formatCartLines(lines: FoodCartLine[]): string {
  return lines
    .map((line) => {
      const qty = line.quantity > 1 ? ` ×${line.quantity}` : "";
      const stock = line.inStock ? "" : " _(sold out)_";
      return `• ${line.name}${qty} — ${rupees(line.lineTotal ?? line.unitPrice)}${stock}`;
    })
    .join("\n");
}

export function formatTotals(totals: FoodTotals): string {
  const rows: string[] = [];
  if (totals.itemTotal !== undefined) rows.push(`Subtotal: ${rupees(totals.itemTotal)}`);
  if (totals.taxesAndCharges !== undefined) rows.push(`Taxes & charges: ${rupees(totals.taxesAndCharges)}`);
  if (totals.deliveryCharge !== undefined) {
    rows.push(`Delivery: ${totals.freeDelivery || totals.deliveryCharge === 0 ? "Free" : rupees(totals.deliveryCharge)}`);
  }
  if (totals.discount) rows.push(`Discount: −${rupees(totals.discount)}`);
  if (totals.toPay !== undefined) rows.push(`**Total: ${rupees(totals.toPay)}**`);
  return rows.join("\n");
}

/** Cart summary shown after each change and at checkout. */
export function formatCartSummary(session: FoodSession, prompt = true): string {
  if (session.cart.length === 0) {
    return "Your cart is empty. What would you like to order?";
  }

  const restaurant = session.restaurant?.name ?? session.totals.couponApplied ?? "your restaurant";
  const body = `**${restaurant}**\n\n${formatCartLines(session.cart)}\n\n${formatTotals(session.totals)}`;

  return prompt ? `${body}\n\nWould you like to add anything else, or shall we check out?` : body;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
