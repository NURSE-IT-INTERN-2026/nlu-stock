<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Stock data model — lots are OPTIONAL on consumables

For a CONSUMABLE item, `Item.availableQty` is the qty source of truth ONLY when the item has lots. Most consumables have **zero lots** — `availableQty` is their sole qty counter. Syncing `availableQty = SUM(lots.remainingQty)` without a `lotCount > 0` guard wipes every lot-less item's stock to 0.

Rule: when deriving a consumable's `availableQty` from lots, always guard `lotCount > 0`. See `src/lib/stock.ts` `recomputeItemCounts`. Tracked items (`trackIndividually`) derive from sub-items instead.

# xlsx comes from SheetJS's CDN, not npm — leave it that way

`package.json` points `xlsx` at `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. This is deliberate. SheetJS stopped publishing to npm in 2022, so `xlsx` on the registry is frozen at 0.18.5 with two unpatched high CVEs and no fix available — the CDN build is the only maintained one.

Rule: never run `npm i xlsx` or `npm i xlsx@latest`. Both silently downgrade to the vulnerable 0.18.5. To upgrade, bump the version in the CDN URL instead.
