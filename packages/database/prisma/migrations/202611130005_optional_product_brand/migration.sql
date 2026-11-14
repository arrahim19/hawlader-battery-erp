CREATE OR REPLACE FUNCTION validate_product_detail() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE product_id uuid; kind "TrackingKind"; battery_count int; parts_count int; category_id uuid;
BEGIN
  IF TG_TABLE_NAME='Product' THEN product_id := NEW.id;
  ELSIF TG_OP='DELETE' THEN product_id := OLD."productId";
  ELSE product_id := NEW."productId"; END IF;
  SELECT t."trackingKind",p."categoryId" INTO kind,category_id FROM "Product" p JOIN "ProductType" t ON t.id=p."typeId" WHERE p.id=product_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO battery_count FROM "BatteryProductDetail" WHERE "productId"=product_id;
  SELECT count(*) INTO parts_count FROM "PartsProductDetail" WHERE "productId"=product_id;
  IF (kind='BATTERY_UNIT' AND (battery_count<>1 OR parts_count<>0)) OR
     (kind='QUANTITY' AND (parts_count<>1 OR battery_count<>0 OR category_id IS NULL)) THEN
    RAISE EXCEPTION 'Product must have exactly its matching tracking detail and quantity products require a product-name group' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
