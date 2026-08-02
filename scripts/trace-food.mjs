// Live end-to-end trace of the conversational food ordering flow against the
// real Swiggy MCP. Exercises the actual food-service modules the app uses.
//
//   node scripts/trace-food.mjs
//
// SAFETY: this never calls place_food_order. It always flushes the cart on exit,
// so your real Swiggy cart is left empty.

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-loader.mjs", pathToFileURL("./scripts/"));

// The demo user is stored as `userId: null` on Approval, so the trace can
// create a real approval row without needing a seeded AtlasUser.
const userId = "atlas-demo-user";

function banner(title) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

function show(label, result) {
  console.log(`\n--- ${label} ---`);
  console.log(result.reply);
  if (result.action) {
    console.log("\n[APPROVAL CARD]");
    console.log(`  ${result.action.title}: ${result.action.summary}`);
    for (const field of result.action.fields) {
      console.log(`  ${field.label.padEnd(20)} ${String(field.value).replace(/\n/g, "\n" + " ".repeat(23))}`);
    }
  }
}

const service = await import("../src/lib/atlas/mcp/food-service.ts");
const { flushCart } = await import("../src/lib/atlas/mcp/swiggy-client.ts");
const { getFoodSession } = await import("../src/lib/atlas/mcp/food-session.ts");

const dish = process.argv[2] ?? "biryani";

try {
  banner("1. Address");
  show("food_set_address()", await service.ensureAddress(userId));

  const session0 = getFoodSession(userId);
  if (session0.addressOptions.length === 0) {
    console.log("\nNo saved addresses — cannot continue.");
    process.exit(0);
  }
  show("food_set_address('1')", await service.ensureAddress(userId, "1"));

  banner(`2. Restaurant discovery — "${dish}"`);
  show(`food_find_restaurants("${dish}")`, await service.discoverRestaurants(userId, dish));

  const session1 = getFoodSession(userId);
  const open = session1.restaurantOptions.find((r) => r.isOpen);
  if (!open) {
    console.log("\nNo open restaurants right now — stopping before cart steps.");
    process.exit(0);
  }

  banner(`3. Select restaurant + load menu — "${open.name}"`);
  show(`food_select_restaurant("${open.name}")`, await service.selectRestaurant(userId, open.name));

  const session2 = getFoodSession(userId);
  const item = session2.menuItems.find((i) => i.inStock && !i.hasVariants && i.price);
  if (!item) {
    console.log("\nNo simple in-stock item to add — stopping.");
    process.exit(0);
  }

  banner("4. Natural-language cart updates");
  show(`food_update_cart("add ${item.name}")`, await service.updateCart(userId, `add ${item.name}`));
  show(`food_update_cart("make it two")`, await service.updateCart(userId, "make it two"));

  const second = session2.menuItems.find((i) => i.inStock && i.id !== item.id && i.price);
  if (second) {
    show(`food_update_cart("add ${second.name}")`, await service.updateCart(userId, `add ${second.name}`));
    show(`food_update_cart("remove ${second.name}")`, await service.updateCart(userId, `remove ${second.name}`));
  }

  banner("5. View cart");
  show("food_view_cart()", await service.showCart(userId));

  banner("6. Checkout -> approval card (order NOT placed)");
  show("food_checkout()", await service.checkout(userId));

  banner("7. Session state");
  const final = getFoodSession(userId);
  console.log(JSON.stringify({
    step: final.step,
    address: final.address?.tag,
    restaurant: final.restaurant?.name,
    menuItems: final.menuItems.length,
    cart: final.cart.map((l) => `${l.name} x${l.quantity}`),
    totals: final.totals,
    payment: final.paymentMethod?.displayName,
    approvalId: final.approvalId,
  }, null, 2));
} finally {
  await flushCart();
  console.log("\n[cart flushed — no order was placed]");
}
