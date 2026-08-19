-- Stretch the demo/smoke data across the last 12 months.
--
-- Everything scripts/smoke-flows.ts writes lands within a few minutes of "now", so every
-- monthly chart shows one bar. This rebuilds the time axis by RANK: all distinct event
-- timestamps are sorted and spread evenly over [now-365d, now].
--
--   * rank, not clock — a burst of 1,700 rows in 30 seconds becomes 1,700 rows across the
--     year, and one stray seeded row hours off on its own can't squash everything else.
--   * one map for every column in every table — the order rows were written in
--     (receive → เบิก → คืน → ซ่อม) survives, so no causality check can break, and
--     timestamps that were equal (a เบิก row and the ON_LOAN log it wrote) stay equal.
--   * dates that hang off an event rather than being one — dueAt, nextMaintenanceAt,
--     nextMaintenanceDate — keep their distance from it, so an overdue loan stays overdue
--     by the same margin.
--
-- Run once, against a dev database, after taking a dump:
--   docker exec -i realnlu-stock-db-1 psql -U nlu_stock -d nlu_stock -v ON_ERROR_STOP=1 < scripts/spread-timestamps.sql

BEGIN;

CREATE TEMP TABLE _tsmap ON COMMIT DROP AS
WITH fresh AS (SELECT (now() at time zone 'utc') - interval '12 hours' AS since),
every_ts AS (
  SELECT "dispensedAt" AS ts FROM dispense_records
  UNION SELECT "returnedAt" FROM dispense_records
  UNION SELECT "recoveredAt" FROM dispense_records
  UNION SELECT "receivedAt" FROM receive_records
  UNION SELECT "returnedAt" FROM return_records
  UNION SELECT "adjustedAt" FROM stock_adjustments
  UNION SELECT "repairSentAt" FROM stock_adjustments
  UNION SELECT "recoveredAt" FROM stock_adjustments
  UNION SELECT "performedAt" FROM maintenance_records
  UNION SELECT "createdAt" FROM maintenance_records
  UNION SELECT "changedAt" FROM item_status_logs
  UNION SELECT "recoveredAt" FROM item_status_logs
  UNION SELECT "changedAt" FROM location_change_logs
  UNION SELECT "receivedDate" FROM lots
  UNION SELECT "createdAt" FROM lots
  UNION SELECT "lastMaintenanceDate" FROM items
  UNION SELECT "lastMaintenanceDate" FROM sub_items
),
ranked AS (
  -- Only the fresh burst is remapped — anything older has been spread by an earlier run and
  -- must keep its place (_map passes unlisted timestamps straight through). So a second smoke
  -- run interleaves into the same year instead of being pushed to the end of it. Run this
  -- right after the smoke run.
  SELECT ts, row_number() OVER (ORDER BY ts) AS rn, count(*) OVER () AS n
    FROM every_ts, fresh WHERE ts IS NOT NULL AND ts >= fresh.since
)
SELECT ts AS old_ts,
       (now() at time zone 'utc') - interval '365 days'
         + interval '365 days' * ((rn - 1)::float / GREATEST(n - 1, 1)) AS new_ts
  FROM ranked;

CREATE INDEX ON _tsmap (old_ts);

CREATE OR REPLACE FUNCTION _map(ts timestamp) RETURNS timestamp AS $$
  SELECT COALESCE((SELECT m.new_ts FROM _tsmap m WHERE m.old_ts = ts), ts);
$$ LANGUAGE sql;

-- ── movements ────────────────────────────────────────────────────────────────
UPDATE dispense_records SET
  "dispensedAt" = _map("dispensedAt"),
  "returnedAt"  = _map("returnedAt"),
  "recoveredAt" = _map("recoveredAt"),
  "dueAt"       = _map("dispensedAt") + ("dueAt" - "dispensedAt");

UPDATE receive_records SET "receivedAt" = _map("receivedAt");
UPDATE return_records  SET "returnedAt" = _map("returnedAt");

UPDATE stock_adjustments SET
  "adjustedAt"   = _map("adjustedAt"),
  "repairSentAt" = _map("repairSentAt"),
  "recoveredAt"  = _map("recoveredAt");

UPDATE maintenance_records SET
  "performedAt"       = _map("performedAt"),
  "createdAt"         = _map("createdAt"),
  "nextMaintenanceAt" = _map("performedAt") + ("nextMaintenanceAt" - "performedAt");

UPDATE item_status_logs SET
  "changedAt"   = _map("changedAt"),
  "recoveredAt" = _map("recoveredAt");

UPDATE location_change_logs SET "changedAt" = _map("changedAt");

UPDATE lots SET
  "receivedDate" = _map("receivedDate"),
  "createdAt"    = _map("createdAt");

-- ── schedules that hang off a job ────────────────────────────────────────────
UPDATE items SET
  "nextMaintenanceDate" = _map("lastMaintenanceDate") + ("nextMaintenanceDate" - "lastMaintenanceDate"),
  "lastMaintenanceDate" = _map("lastMaintenanceDate")
 WHERE "lastMaintenanceDate" IS NOT NULL;

UPDATE sub_items SET
  "nextMaintenanceDate" = _map("lastMaintenanceDate") + ("nextMaintenanceDate" - "lastMaintenanceDate"),
  "lastMaintenanceDate" = _map("lastMaintenanceDate")
 WHERE "lastMaintenanceDate" IS NOT NULL;

-- ── รายการถูกสร้างก่อนจะมีความเคลื่อนไหว ──
-- An item whose history starts a year ago cannot have been added to the system today.
WITH first_move AS (
  SELECT "itemId" AS id, min(ts) AS at FROM (
    SELECT "itemId", "dispensedAt" AS ts FROM dispense_records
    UNION ALL SELECT "itemId", "receivedAt" FROM receive_records
    UNION ALL SELECT "itemId", "changedAt" FROM item_status_logs
  ) x GROUP BY 1
)
UPDATE items i SET "createdAt" = f.at - (interval '1 day' * (7 + random() * 60))
  FROM first_move f
 WHERE f.id = i.id AND i."createdAt" > f.at;

UPDATE sub_items s SET "createdAt" = i."createdAt" + (interval '1 day' * random() * 3)
  FROM items i
 WHERE i.id = s."itemId" AND s."createdAt" > i."createdAt";

DROP FUNCTION _map(timestamp);

COMMIT;
