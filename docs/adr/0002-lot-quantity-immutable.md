# Lot quantity — received/remaining split + adjustment-ledger

`Lot` had a single ambiguous `quantity` field — you could not tell how much was originally received
once stock had been dispensed, and there was no honest way to correct a data-entry mistake without
destroying the audit trail.

We split lot quantity and treat corrections like an accounting ledger — every correction is a
recorded transaction, the original receipt is never silently edited.

- **`Lot.receivedQty`** — cumulative amount received into this lot. Set on first receive; a re-receive of the same `lotNumber` (a top-up of the same batch) increments both `receivedQty` and `remainingQty`.
- **`Lot.remainingQty`** — current stock in this lot; decremented on each dispense.
- **Corrections go through `StockAdjustment`** (which gained a nullable `lotId` + a signed `delta`) — forgot-to-log, mis-count, found stock, loss. Never edit `receivedQty` to fix a mistake; log an adjustment with a reason + note so the trail is reconstructable. *(The model supports this; a dedicated "correct lot" UI is not wired yet.)*
- A lot's truth at any moment: `remaining = receivedQty − sum(dispenses) ± sum(adjustments)`.

## `Item.totalQty` / `availableQty` — maintained counters (for now)

These are still **maintained counters**, incremented/decremented in the same transaction as the
lot/dispense write, and read directly by the dashboard, item list, dispense, and reports.

The cleaner end-state (single source of truth) is to **derive** them:
- consumables: `availableQty = sum(Lot.remainingQty)`
- borrow-count durables: `availableQty = totalQty − sum(unreturned DispenseRecord.quantity)`

That derivation is **deferred** — it is a broad read-path refactor with regression risk for
marginal benefit while the system is dev and re-seeded. The risk of the current maintained counters
is drift under bugs/concurrent writes; acceptable now, revisit before production.

## Considered options (rejected)

- **Edit `receivedQty` to fix mistakes** — destroys the audit trail. Rejected; use an adjustment.
- **One lot = one receive, no top-ups** — would reject legitimate re-receipts of the same batch and complicate the receive UX. Rejected; same-`lotNumber` top-ups are allowed and accumulate into `receivedQty`.
- **Strict single-source-of-truth derivation now** — large refactor across many read paths; deferred (see above).

## Consequences

- Full per-lot traceability: received X, consumed Y, left Z, with corrections visible as adjustments.
- **Schema:** `Lot.quantity` → `receivedQty` + `remainingQty`; `StockAdjustment` gained `lotId` + `delta`.
- `totalQty`/`availableQty` are maintained counters today — a future refactor derives them.
- dev: re-seed. Production (future) would need a backfill that sets `receivedQty`/`remainingQty` from the prior `quantity`.
