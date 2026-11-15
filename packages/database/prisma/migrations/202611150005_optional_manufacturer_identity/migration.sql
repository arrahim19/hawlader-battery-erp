-- Purchases and sales use product models and quantities. Keep historical
-- manufacturer details intact, while allowing stock without those details.
CREATE OR REPLACE FUNCTION validate_battery_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_product uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW."internalCode",NEW."productId",NEW."batchId",NEW."serialNumber",NEW."productionDate",NEW.origin) IS DISTINCT FROM (OLD."internalCode",OLD."productId",OLD."batchId",OLD."serialNumber",OLD."productionDate",OLD.origin) THEN
    RAISE EXCEPTION 'Stock record and original provenance are immutable' USING ERRCODE='23514';
  END IF;
  SELECT "productId" INTO batch_product FROM "StockBatch" WHERE id=NEW."batchId";
  IF NOT EXISTS (SELECT 1 FROM "BatteryProductDetail" WHERE "productId"=NEW."productId") OR batch_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Battery product/batch mismatch' USING ERRCODE='23514';
  END IF;
  NEW."normalizedSerial" := NULLIF(upper(btrim(NEW."serialNumber")), '');
  RETURN NEW;
END $$;
