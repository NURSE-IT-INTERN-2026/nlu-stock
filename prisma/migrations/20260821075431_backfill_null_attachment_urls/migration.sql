-- Data fix, no schema change.
--
-- maintenance_records.attachmentUrls was the one evidence array that never got @default([]);
-- 20260821030306_attachment_log added the default, but SET DEFAULT only binds new rows. Rows
-- written before it still hold NULL, and in Postgres `NULL || ARRAY['x']` is NULL — so the
-- first retroactive attach on one of those rows would wipe it instead of appending.
UPDATE "maintenance_records" SET "attachmentUrls" = ARRAY[]::TEXT[] WHERE "attachmentUrls" IS NULL;
