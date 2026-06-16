# NLU code scheme — flat code, หมวดย่อย in CategoryType, uniform COPY

The old scheme embedded หมวด/หมวดย่อย positionally inside the item code string, in three
different shapes (`NLU-CON-001`, `NLU-ELE-001-001`, `NLU-BOOK-013-001-S10-C01`). To suggest the
next code, `suggest-code` had to scan every item and `split("-")` to find the max number, and หมวด
names were jammed into `Item.description`. The หมวด was unqueryable, unsortable, and fragile.

We decided to flatten the code and move หมวดย่อย out of it entirely:

- **Item code = `NLU-{PREFIX}-{NNN}`** — a global running number per prefix.
  - optional **`-{SNN}`** (set size) for BOOK/TOY sets only; single books/toys omit it.
  - **copy (`-{CNN}`)** lives on the SubItem (`subCode`), not the Item code. Full reference = `item.code + "-" + subCode`.
- **หมวดย่อย = `CategoryType` rows**; `Item.categoryId` points to one. It is NOT in the code.
- **COPY (`CNN`) is uniform** across every `trackIndividually` category (KRU/ELE/BOOK/TOY). Previously KRU used bare `001` and BOOK/TOY used `C01`.
- **`CategoryType.number` is nullable.** BOOK 001-013 and TOY 014 have canonical numbers; KRU's 12 named types do not (we do not fabricate numbers); ELE's types are 1:1 with items so the running `NNN` already serves as the type number.
- **SET shown only for sets** (option B): `-S06` for a 6-volume set, nothing for a single book. `Item.setSize` is stored as a field (source of truth) and the `S` segment is generated from it.

## Considered options (rejected)

- **Keep หมวด in the code** (parse strings for everything) — the fragility we are removing. Rejected.
- **`CategoryType.number` mandatory** — forces fabricating numbers for KRU, which has none. Rejected.
- **SET always shown (`S01` for singles)** — `S` should mean "this is a set"; `S01` floating on every single book is noise. Rejected.
- **SET in code only, no field** — reintroduces string parsing for set size. Rejected; `setSize` field is source of truth, code is generated.

## Consequences

- `suggest-code` finds the next `NNN`/`CNN` by counting existing items/sub-items — no string parsing, no full-table `split("-")`.
- `Item.setSize` and `CategoryType.number` are the fields code is generated from.
- Existing ~929 items + ~1131 sub-items are re-seeded under the new scheme (dev only — no production migration written yet).
- **Adding a หมวดย่อย to any category later (e.g. DUR gains sub-types) = inserting `CategoryType` rows + setting `categoryId`. No schema change, no code-format change.** The scheme is future-proof by design.

## Unified format

| PREFIX | tracking | Item code | SET | COPY (SubItem) |
|---|---|---|---|---|
| CON / MED | Consumable | `NLU-X-NNN` | — | — |
| DUR / KIT | Durable | `NLU-X-NNN` | — | — |
| KRU / ELE | Asset | `NLU-X-NNN` | — | `CNN` |
| BOOK / TOY | Asset | `NLU-X-NNN[-SNN]` | `SNN` (sets only) | `CNN` |
