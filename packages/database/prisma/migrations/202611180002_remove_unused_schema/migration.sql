-- Remove unused foundation models after checking that they contain no records.
-- Keep stock, transaction, replacement, accounting, audit and migration history.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE "Vehicle", "BatterySet", "PurchaseRemainderCancellation", "StockAdjustment", "StockAdjustmentItem", "SupplierReturn", "SupplierReturnItem", "WarrantyPolicy", "BatteryInspection", "ReplacementDelivery", "ReplacementOutcomeEvent", "ReplacementCharge", "DocumentSnapshot", "OutboxEvent", "Product", "Purchase", "StockBatch", "Sale", "SaleUnit" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Vehicle") THEN
    RAISE EXCEPTION 'Cleanup stopped because Vehicle contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "BatterySet") THEN
    RAISE EXCEPTION 'Cleanup stopped because BatterySet contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "PurchaseRemainderCancellation") THEN
    RAISE EXCEPTION 'Cleanup stopped because PurchaseRemainderCancellation contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "StockAdjustment") THEN
    RAISE EXCEPTION 'Cleanup stopped because StockAdjustment contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "StockAdjustmentItem") THEN
    RAISE EXCEPTION 'Cleanup stopped because StockAdjustmentItem contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupplierReturn") THEN
    RAISE EXCEPTION 'Cleanup stopped because SupplierReturn contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupplierReturnItem") THEN
    RAISE EXCEPTION 'Cleanup stopped because SupplierReturnItem contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "WarrantyPolicy") THEN
    RAISE EXCEPTION 'Cleanup stopped because WarrantyPolicy contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "BatteryInspection") THEN
    RAISE EXCEPTION 'Cleanup stopped because BatteryInspection contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "ReplacementDelivery") THEN
    RAISE EXCEPTION 'Cleanup stopped because ReplacementDelivery contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "ReplacementOutcomeEvent") THEN
    RAISE EXCEPTION 'Cleanup stopped because ReplacementOutcomeEvent contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "ReplacementCharge") THEN
    RAISE EXCEPTION 'Cleanup stopped because ReplacementCharge contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "DocumentSnapshot") THEN
    RAISE EXCEPTION 'Cleanup stopped because DocumentSnapshot contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "OutboxEvent") THEN
    RAISE EXCEPTION 'Cleanup stopped because OutboxEvent contains records';
  END IF;
  IF EXISTS (SELECT 1 FROM "Product" WHERE "defaultPurchasePrice" IS NOT NULL) THEN
    RAISE EXCEPTION 'Cleanup stopped because Product.defaultPurchasePrice contains data';
  END IF;
  IF EXISTS (SELECT 1 FROM "Purchase" WHERE "remainderCancelledAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Cleanup stopped because Purchase.remainderCancelledAt contains data';
  END IF;
  IF EXISTS (SELECT 1 FROM "StockBatch" WHERE "adjustmentItemId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Cleanup stopped because StockBatch.adjustmentItemId contains data';
  END IF;
  IF EXISTS (SELECT 1 FROM "Sale" WHERE "vehicleId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Cleanup stopped because Sale.vehicleId contains data';
  END IF;
  IF EXISTS (SELECT 1 FROM "SaleUnit" WHERE "batterySetId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Cleanup stopped because SaleUnit.batterySetId contains data';
  END IF;
END;
$$;

ALTER TABLE "Product" DROP CONSTRAINT "product_prices_nonnegative";
ALTER TABLE "StockBatch" DROP CONSTRAINT "batch_exact_source";
ALTER TABLE "Product" DROP COLUMN "defaultPurchasePrice";
ALTER TABLE "Purchase" DROP COLUMN "remainderCancelledAt";
ALTER TABLE "StockBatch" DROP COLUMN "adjustmentItemId";
ALTER TABLE "Sale" DROP COLUMN "vehicleId";
ALTER TABLE "SaleUnit" DROP COLUMN "batterySetId";

ALTER TABLE "Product" ADD CONSTRAINT "product_prices_nonnegative"
  CHECK ("defaultSellingPrice" >= 0 AND "lowStockThreshold" >= 0);
ALTER TABLE "StockBatch" ADD CONSTRAINT "batch_exact_source" CHECK (
  num_nonnulls("receiptItemId", "replacementReceiptItemId", "openingItemId", "returnItemId") = 1 AND
  (("origin" = 'PURCHASE' AND "receiptItemId" IS NOT NULL) OR
   ("origin" = 'REPLACEMENT' AND "replacementReceiptItemId" IS NOT NULL) OR
   ("origin" = 'OPENING' AND "openingItemId" IS NOT NULL) OR
   ("origin" = 'RETURN' AND "returnItemId" IS NOT NULL))
);

DROP TABLE "Vehicle", "BatterySet", "PurchaseRemainderCancellation", "StockAdjustment", "StockAdjustmentItem", "SupplierReturn", "SupplierReturnItem", "WarrantyPolicy", "BatteryInspection", "ReplacementDelivery", "ReplacementOutcomeEvent", "ReplacementCharge", "DocumentSnapshot", "OutboxEvent";

-- These authentication records can no longer authenticate or rate-limit a login.
DELETE FROM "Session" WHERE "revokedAt" IS NOT NULL OR "expiresAt" <= NOW();
DELETE FROM "LoginAttempt" WHERE "windowStartedAt" < NOW() - INTERVAL '15 minutes';
COMMIT;
