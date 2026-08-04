# Swiggy Provider

## Behavior

- Restaurant search may return dish names instead of restaurants when the query is a dish name (degenerate results)
  - Recovery: Use dish search to build a proper restaurant list with ratings and ETAs
- Cart may return empty after a write operation (closed restaurant, area not serviceable, or item dropped)
  - Recovery: Preserve the existing cart the user already built, surface a recovery note
- Payment uses UPI flow with pending status polling — the order is not confirmed until UPI payment succeeds
- Approval required before order placement — creating the approval card is NOT placing the order
- Address list is paginated (page size 10) — fetch all pages so the user sees their complete address book
- Cart uses declarative replacement — sending the full desired item set, not incremental adds
