-- PostgreSQL constraints supplement Prisma's schema. No business data is seeded.
ALTER TABLE "User" ADD CONSTRAINT "user_login_normalized" CHECK ("login" = lower(btrim("login")) AND length("login") > 0);
ALTER TABLE "Session" ADD CONSTRAINT "session_valid_expiry" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "Product" ADD CONSTRAINT "product_prices_nonnegative" CHECK ("defaultSellingPrice" >= 0 AND ("defaultPurchasePrice" IS NULL OR "defaultPurchasePrice" >= 0) AND "lowStockThreshold" >= 0);
ALTER TABLE "BatteryProductDetail" ADD CONSTRAINT "battery_specs_positive" CHECK ("capacityAh" > 0 AND "voltage" > 0 AND "defaultWarrantyMonths" >= 0);
ALTER TABLE "PartsProductDetail" ADD CONSTRAINT "parts_warranty_nonnegative" CHECK ("defaultWarrantyMonths" >= 0);
ALTER TABLE "WarrantyPolicy" ADD CONSTRAINT "policy_values_valid" CHECK ("version" > 0 AND "months" >= 0);
ALTER TABLE "Purchase" ADD CONSTRAINT "purchase_costs_nonnegative" CHECK ("discount" >= 0 AND "additionalCosts" >= 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "purchase_item_values" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "allocatedDiscount" >= 0 AND "allocatedCosts" >= 0 AND "expectedUnitCost" >= 0);
ALTER TABLE "PurchaseRemainderCancellation" ADD CONSTRAINT "purchase_cancel_quantity" CHECK ("quantity" > 0);
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "receipt_item_values" CHECK ("quantity" > 0 AND "netCost" >= 0);
ALTER TABLE "StockBatch" ADD CONSTRAINT "batch_values" CHECK ("originalQuantity" > 0 AND "unitCost" >= 0);
ALTER TABLE "StockBatch" ADD CONSTRAINT "batch_exact_source" CHECK (
  num_nonnulls("receiptItemId", "replacementReceiptItemId", "openingItemId", "adjustmentItemId", "returnItemId") = 1 AND
  (("origin" = 'PURCHASE' AND "receiptItemId" IS NOT NULL) OR
   ("origin" = 'REPLACEMENT' AND "replacementReceiptItemId" IS NOT NULL) OR
   ("origin" = 'OPENING' AND "openingItemId" IS NOT NULL) OR
   ("origin" = 'ADJUSTMENT' AND "adjustmentItemId" IS NOT NULL) OR
   ("origin" = 'RETURN' AND "returnItemId" IS NOT NULL))
);
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "inventory_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "movement_positive" CHECK ("quantity" > 0 AND ("batteryUnitId" IS NULL OR "quantity" = 1));
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "adjustment_positive" CHECK ("quantity" > 0);
ALTER TABLE "BatteryUnit" ADD CONSTRAINT "unit_availability_dimensions" CHECK (
  "commercialState" <> 'AVAILABLE' OR ("condition" = 'GOOD' AND "custody" = 'SHOP' AND "ownership" = 'SHOP' AND "reservedCustomerId" IS NULL AND "reservedReplacementId" IS NULL)
);
ALTER TABLE "BatteryUnit" ADD CONSTRAINT "unit_reservation_dimensions" CHECK (
  "commercialState" <> 'RESERVED' OR ("condition" = 'GOOD' AND "custody" = 'SHOP' AND "ownership" = 'CUSTOMER' AND "reservedCustomerId" IS NOT NULL AND "reservedReplacementId" IS NOT NULL)
);
ALTER TABLE "Sale" ADD CONSTRAINT "sale_amounts_nonnegative" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "total" >= 0);
ALTER TABLE "SaleItem" ADD CONSTRAINT "sale_item_values" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "discount" >= 0 AND "netRevenue" >= 0 AND "costTotal" >= 0);
ALTER TABLE "SaleUnit" ADD CONSTRAINT "coverage_dates" CHECK ("coverageExpiry" >= "coverageStart" AND "costAtSale" >= 0);
CREATE UNIQUE INDEX "SaleUnit_one_active_assignment" ON "SaleUnit" ("batteryUnitId") WHERE "releasedAt" IS NULL;
ALTER TABLE "CostAllocation" ADD CONSTRAINT "cost_allocation_values" CHECK ("quantity" > 0 AND "unitCost" >= 0 AND "cogs" >= 0);
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "sales_return_values" CHECK ("quantity" > 0 AND "creditAmount" >= 0);
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "supplier_return_values" CHECK ("quantity" > 0 AND "carryingCost" >= 0);
ALTER TABLE "ReplacementRecord" ADD CONSTRAINT "replacement_source_links" CHECK (
  ("source" = 'BEFORE_SALE' AND "warrantyClaimId" IS NULL AND "reservedCustomerId" IS NULL) OR
  ("source" = 'CUSTOMER_WARRANTY' AND "warrantyClaimId" IS NOT NULL AND "reservedCustomerId" IS NOT NULL)
);
CREATE UNIQUE INDEX "ReplacementRecord_one_unresolved_case" ON "ReplacementRecord" ("oldUnitId") WHERE "status" <> 'COMPLETED' AND "outcomeResolvedAt" IS NULL;
CREATE UNIQUE INDEX "DispatchItem_one_active_dispatch" ON "DispatchItem" ("replacementId") WHERE "returnedAt" IS NULL;
ALTER TABLE "ReplacementReceiptItem" ADD CONSTRAINT "replacement_new_identity" CHECK ("oldUnitId" <> "newUnitId" AND "inheritedUnitCost" >= 0);
ALTER TABLE "JournalLine" ADD CONSTRAINT "journal_line_one_side" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0));
ALTER TABLE "JournalLine" ADD CONSTRAINT "journal_party_scope" CHECK (num_nonnulls("customerId", "supplierId") <= 1);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_positive_party" CHECK ("amount" > 0 AND (("direction"='INCOMING' AND "customerId" IS NOT NULL AND "supplierId" IS NULL) OR ("direction"='OUTGOING' AND "supplierId" IS NOT NULL AND "customerId" IS NULL)));
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "allocation_target" CHECK ("amount" > 0 AND num_nonnulls("saleId", "purchaseReceiptId") = 1);
ALTER TABLE "Expense" ADD CONSTRAINT "expense_positive" CHECK ("amount" > 0);
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "expense_settlement_positive" CHECK ("amount" > 0);
ALTER TABLE "ReplacementCharge" ADD CONSTRAINT "replacement_charge_positive" CHECK ("amount" > 0);

-- Entire journals must exist and balance at commit, including empty-entry cases.
CREATE FUNCTION assert_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_id uuid; line_count bigint; debit_total numeric; credit_total numeric;
BEGIN
  IF TG_TABLE_NAME = 'JournalEntry' THEN entry_id := NEW.id; ELSE entry_id := NEW."entryId"; END IF;
  SELECT count(*), COALESCE(sum(debit),0), COALESCE(sum(credit),0)
    INTO line_count, debit_total, credit_total FROM "JournalLine" WHERE "entryId"=entry_id;
  IF line_count < 2 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Journal must have at least two lines and equal debits and credits' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "journal_header_balance" AFTER INSERT ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_journal();
CREATE CONSTRAINT TRIGGER "journal_lines_balance" AFTER INSERT ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_journal();

CREATE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted history is immutable; append a linked reversal' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "audit_immutable" BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER "movement_immutable" BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER "journal_immutable" BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER "journal_line_immutable" BEFORE UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

CREATE FUNCTION validate_product_detail() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE product_id uuid; kind "TrackingKind"; battery_count int; parts_count int; brand_id uuid; category_id uuid;
BEGIN
  IF TG_TABLE_NAME='Product' THEN product_id := NEW.id;
  ELSIF TG_OP='DELETE' THEN product_id := OLD."productId";
  ELSE product_id := NEW."productId"; END IF;
  SELECT t."trackingKind",p."brandId",p."categoryId" INTO kind,brand_id,category_id FROM "Product" p JOIN "ProductType" t ON t.id=p."typeId" WHERE p.id=product_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO battery_count FROM "BatteryProductDetail" WHERE "productId"=product_id;
  SELECT count(*) INTO parts_count FROM "PartsProductDetail" WHERE "productId"=product_id;
  IF (kind='BATTERY_UNIT' AND (battery_count<>1 OR parts_count<>0 OR brand_id IS NULL)) OR
     (kind='QUANTITY' AND (parts_count<>1 OR battery_count<>0 OR category_id IS NULL)) THEN
    RAISE EXCEPTION 'Product must have exactly its matching tracking detail and required brand/category' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "product_detail_guard" AFTER INSERT OR UPDATE ON "Product" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_product_detail();
CREATE CONSTRAINT TRIGGER "battery_detail_guard" AFTER INSERT OR UPDATE OR DELETE ON "BatteryProductDetail" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_product_detail();
CREATE CONSTRAINT TRIGGER "parts_detail_guard" AFTER INSERT OR UPDATE OR DELETE ON "PartsProductDetail" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_product_detail();

CREATE FUNCTION validate_battery_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE method "IdentificationMethod"; batch_product uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW."internalCode",NEW."productId",NEW."batchId",NEW."serialNumber",NEW."productionDate",NEW.origin) IS DISTINCT FROM (OLD."internalCode",OLD."productId",OLD."batchId",OLD."serialNumber",OLD."productionDate",OLD.origin) THEN
    RAISE EXCEPTION 'Battery identity and original provenance are immutable' USING ERRCODE='23514';
  END IF;
  SELECT "identificationMethod" INTO method FROM "BatteryProductDetail" WHERE "productId"=NEW."productId";
  SELECT "productId" INTO batch_product FROM "StockBatch" WHERE id=NEW."batchId";
  IF method IS NULL OR batch_product IS DISTINCT FROM NEW."productId" THEN RAISE EXCEPTION 'Battery product/batch mismatch' USING ERRCODE='23514'; END IF;
  NEW."normalizedSerial" := NULLIF(upper(btrim(NEW."serialNumber")), '');
  IF (method IN ('SERIAL','BOTH') AND NEW."normalizedSerial" IS NULL) OR (method IN ('PRODUCTION_DATE','BOTH') AND NEW."productionDate" IS NULL) THEN
    RAISE EXCEPTION 'Required manufacturer identification is missing' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "battery_identity_guard" BEFORE INSERT OR UPDATE ON "BatteryUnit" FOR EACH ROW EXECUTE FUNCTION validate_battery_identity();

CREATE FUNCTION validate_parts_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind "TrackingKind";
BEGIN
  SELECT t."trackingKind" INTO kind FROM "StockBatch" b JOIN "Product" p ON p.id=b."productId" JOIN "ProductType" t ON t.id=p."typeId" WHERE b.id=NEW."batchId";
  IF kind IS DISTINCT FROM 'QUANTITY' THEN RAISE EXCEPTION 'Only quantity-tracked parts use inventory balances' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "parts_balance_guard" BEFORE INSERT OR UPDATE ON "InventoryBalance" FOR EACH ROW EXECUTE FUNCTION validate_parts_balance();

-- Catalog tracking attributes cannot be rewritten after transaction references.
CREATE FUNCTION guard_product_tracking_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."typeId",NEW.unit) IS DISTINCT FROM (OLD."typeId",OLD.unit) AND
    (EXISTS(SELECT 1 FROM "StockBatch" WHERE "productId"=OLD.id) OR EXISTS(SELECT 1 FROM "PurchaseItem" WHERE "productId"=OLD.id) OR EXISTS(SELECT 1 FROM "SaleItem" WHERE "productId"=OLD.id)) THEN
    RAISE EXCEPTION 'Referenced product tracking and base unit are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "product_tracking_immutable" BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION guard_product_tracking_change();
CREATE FUNCTION guard_identification_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."identificationMethod" IS DISTINCT FROM OLD."identificationMethod" AND
    (EXISTS(SELECT 1 FROM "StockBatch" WHERE "productId"=OLD."productId") OR EXISTS(SELECT 1 FROM "PurchaseItem" WHERE "productId"=OLD."productId")) THEN
    RAISE EXCEPTION 'Referenced battery identification method is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "identification_immutable" BEFORE UPDATE ON "BatteryProductDetail" FOR EACH ROW EXECUTE FUNCTION guard_identification_change();
