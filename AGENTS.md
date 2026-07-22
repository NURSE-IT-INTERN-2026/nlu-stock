<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Stock data model — lots are OPTIONAL on consumables

For a CONSUMABLE item, `Item.availableQty` is the qty source of truth ONLY when the item has lots. Most consumables have **zero lots** — `availableQty` is their sole qty counter. Syncing `availableQty = SUM(lots.remainingQty)` without a `lotCount > 0` guard wipes every lot-less item's stock to 0.

Rule: when deriving a consumable's `availableQty` from lots, always guard `lotCount > 0`. See `src/lib/stock.ts` `recomputeItemCounts`. Tracked items (`trackIndividually`) derive from sub-items instead.
