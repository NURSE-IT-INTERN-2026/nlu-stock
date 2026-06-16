# Lot quantity — received/remaining split, immutable + adjustment-ledger

`Lot` had a single ambiguous `quantity` field — you could not tell how much was originally received
once stock had been dispensed, and there was no honest way to correct a data-entry mistake without
destroying the audit trail. `Item.totalQty` / `availableQty` were maintained as separate counters,
which drift from the truth over time.

We split lot quantity and treat it like an accounting ledger — every change is a recorded
transaction, nothing is mutated in place.

- **`Lot.receivedQty` (immutable)** — set once on receive, never edited.
- **`Lot.remainingQty`** — decremented on each dispense.
- **`Item.availableQty` is derived** = `sum(Lot.remainingQty)` for consumables (and `totalQty − unreturned dispenses` for borrow-count durables). No separately-maintained counter — lots/dispenses are the single source of truth.
- **One lot = one receive.** No top-ups. Corrections (forgot-to-log, mis-count, found stock) go through a `StockAdjustment` (which gains a nullable `lotId`), with a reason and a mandatory note — never by editing `receivedQty`.
- A lot's truth at any moment: `remaining = receivedQty − sum(dispenses) ± sum(adjustments)`.

## Considered options (rejected)

- **Mutable `receivedQty`, edit on mistake** — destroys audit trail; you can never reconstruct what actually happened. Rejected.
- **Derive `receivedQty` from `ReceiveRecord` with top-ups** — a lot would accumulate multiple receipts, making per-lot math and expiry handling more complex for no real benefit. Rejected; one lot per receive is simpler and matches how consumable batches actually arrive.
- **Store `availableQty` as maintained counter** — drifts from `sum(remainingQty)` under bugs/concurrent writes. Rejected; derive it.

## Consequences

- Full per-lot traceability: received X, consumed Y, left Z, with every correction visible as an adjustment.
- **Schema change:** `StockAdjustment` needs a nullable `lotId` (currently item-level only); `Lot.quantity` is replaced by `receivedQty` + `remainingQty`.
- dev: re-seed. Production (future) would need a backfill migration that sets `receivedQty = current quantity` and zero-derives history.
