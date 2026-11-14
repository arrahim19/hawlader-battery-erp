-- A replacement batch points to its receipt item; that item points to the new
-- unit, which needs the batch. Allocate IDs up front and insert all three in
-- one transaction. Defer this FK to commit so the normalized lineage can be
-- created without nullable provenance or overwriting an old battery.
ALTER TABLE "StockBatch"
  ALTER CONSTRAINT "StockBatch_replacementReceiptItemId_fkey"
  DEFERRABLE INITIALLY DEFERRED;
