-- ส่งบำรุงรักษาภายนอก is a real place a piece can be, so it is a status again.
-- (The 2026-08-24 migration dropped it precisely because nothing could ever write it;
-- the external leg of a preventive round is that write path.)
ALTER TYPE "ItemStatus" ADD VALUE IF NOT EXISTS 'PENDING_MAINTENANCE';
