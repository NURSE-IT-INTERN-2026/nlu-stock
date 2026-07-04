-- Rename enum value: CHECKED_OUT → ON_LOAN (borrowed, not consumed).
-- Existing rows update in place; no data loss.
ALTER TYPE "ItemStatus" RENAME VALUE 'CHECKED_OUT' TO 'ON_LOAN';
