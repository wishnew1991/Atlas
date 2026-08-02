# Swiggy MCP — Capability Report

Date: 2026-07-30
Server: `https://mcp.swiggy.com/food` (`swiggy-food-mcp-server` v0.1.0)
Method: live `tools/list` + `tools/call` probes against the authenticated account.

## Headline finding

**No Swiggy MCP capability is missing for the Phase 4 brief.** Every feature the
brief asks for is already served by an existing tool. The previous implementation
simply did not call most of them.

The real defect was on the Atlas side: `food-workflow.ts` regex-scraped the
human-readable `message` string and discarded `structuredContent`, which is where
Swiggy returns ratings, ETAs, prices, veg flags, stock status and the full tax
breakdown.

## Tool inventory (18 tools)

| Tool | Used before | Used now | Purpose |
|---|---|---|---|
| `get_addresses` | yes | yes | Saved addresses, paginated |
| `search_restaurants` | **no** | **yes** | Restaurant discovery w/ rating, ETA, cost |
| `search_menu` | yes | yes | Dish search across/within restaurants |
| `get_restaurant_menu` | **no** | **yes** | Full menu, paginated by category |
| `get_food_cart` | **no** | **yes** | Live cart + pricing |
| `update_food_cart` | yes | yes | Add / change quantity / remove |
| `flush_food_cart` | **no** | **yes** | Clear cart |
| `place_food_order` | no | yes (post-approval) | Place the order |
| `fetch_food_coupons` | **no** | available | List coupons + applicability |
| `apply_food_coupon` | **no** | available | Apply a coupon |
| `get_payment_options` | yes | yes | Live payment methods |
| `get_food_orders` | no | available | Order history |
| `get_food_order_details` | no | available | Order detail |
| `track_food_order` | no | available | Live tracking |
| `get_food_delivery_status` | no | internal | Widget-only ETA polling |
| `check_payment_status` | no | available | UPI payment status |
| `confirm_order` | no | available | Finalise a pre-placed order |
| `report_error` | no | available | Error reporting to Swiggy |

## Field availability vs. brief requirements

All confirmed present in `structuredContent`:

| Brief requirement | Source | Field |
|---|---|---|
| Restaurant name | `search_restaurants` | `restaurants[].name` |
| Rating | `search_restaurants` | `avgRating`, `totalRatings` |
| Delivery ETA | `search_restaurants` | `deliveryTimeMinutes`, `deliveryTimeRange` |
| Price for dish | `get_restaurant_menu` | `categories[].items[].price` |
| Delivery fee | `update_food_cart` / `get_food_cart` | `pricing.delivery_charge` |
| Offers | `fetch_food_coupons`, cart | `offers.coupon_discount` |
| Categories | `get_restaurant_menu` | `categories[].title` |
| Availability | menu + cart | `inStock`, `in_stock` |
| Popular items | `get_restaurant_menu` | `isBestseller` |
| Veg / Non-veg | `get_restaurant_menu` | `isVeg` |
| Subtotal | cart | `pricing.item_total` |
| Taxes | cart | `pricing.taxes_and_charges` |
| Discounts | cart | `offers.coupon_discount` |
| Grand total | cart | `pricing.to_pay` |
| Payment method | `get_payment_options` | `platforms.*.methods[]` |
| Pagination | menu / search | `page`, `hasMore`, `nextOffset` |

## Observed behaviours worth knowing

1. **`costForTwo` is a browsing signal, not the dish price.** The brief's example
   line (`Meghana Foods ⭐4.6 • 28 min • ₹320`) implies a per-dish price at
   discovery time. `search_restaurants` returns only "₹N for two"; the actual dish
   price is only known after `get_restaurant_menu` or `search_menu`. Atlas shows
   cost-for-two at discovery and real prices on the menu. Showing a true per-dish
   price in the restaurant list would need one menu call per restaurant (N+1),
   which is not worth the latency.

2. **`inStock` is omitted when an item is available.** Only an explicit `0` means
   out of stock — treating "absent" as unavailable would hide most of the menu.

3. **`statusCode: 6` / "Restaurant is no longer taking new orders" is returned
   in-band** alongside a `result: "success"` cart. It must be read as a soft
   warning, not a failure. This drives the closed-restaurant recovery path.

4. **`update_food_cart` is declarative for the item set it receives**, so removal
   and quantity edits are expressed by resending the full desired cart. Sending an
   empty array does not reliably clear the cart — `flush_food_cart` does.

5. **Cart prices differ from menu prices.** The menu lists the base price
   (₹250) while the cart returns `final_price` (₹278) including packing etc. The
   approval card always uses live cart figures, never menu figures.

6. **Coupon `code` is a UUID**, not the display label (`STEALDEAL`). `apply_food_coupon`
   needs the UUID.

## Genuine gaps (nice-to-have, none blocking)

1. **No non-veg-only filter.** `search_menu.vegFilter` accepts `1` (veg only) or
   `0` (mixed). The server documents this limitation itself.
2. **No restaurant-level offers in `search_restaurants`.** Offer banners ("50% off
   up to ₹100") shown in the Swiggy app are not in the discovery payload; coupons
   are only retrievable per-restaurant after a cart exists via `fetch_food_coupons`.
   Showing offers in the restaurant list would require an N+1 call per restaurant.
3. **No delivery-fee estimate before a cart exists.** `delivery_charge` only appears
   once items are in the cart, so it cannot be shown in the discovery list.
4. **No address serviceability pre-check.** There is no "does this restaurant deliver
   to this address" call; an out-of-area condition only surfaces as a cart/search
   error, which Atlas handles as a recovery path.
5. **Token lifetime ~10h with no refresh flow.** Re-auth is manual via `/admin`.
   Not an MCP gap as such, but it is the most likely cause of a sudden 401.
