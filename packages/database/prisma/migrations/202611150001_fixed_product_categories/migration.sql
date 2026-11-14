-- Reuse matching existing categories so their products and product names retain
-- their IDs. Other historical types remain intact for existing transactions.
DO $$
DECLARE
  category record;
  existing_id uuid;
BEGIN
  FOR category IN SELECT * FROM (VALUES
    ('BATTERY', 'Battery', 'BATTERY_UNIT'),
    ('PARTS', 'Parts', 'QUANTITY'),
    ('EASY_BIKE_RICKSHAW', 'Easy Bike & Rickshaw', 'QUANTITY')
  ) AS fixed(code, name, tracking)
  LOOP
    SELECT id INTO existing_id FROM "ProductType"
    WHERE code = category.code
       OR (lower(trim(name)) = lower(category.name)
           AND "trackingKind" = category.tracking::"TrackingKind")
    ORDER BY (code = category.code) DESC, "createdAt", id
    LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO "ProductType" (id, code, name, "trackingKind", active, "updatedAt")
      VALUES (gen_random_uuid(), category.code, category.name,
              category.tracking::"TrackingKind", true, now());
    ELSE
      UPDATE "ProductType" SET code = category.code, name = category.name,
        active = true, "updatedAt" = now() WHERE id = existing_id;
    END IF;
  END LOOP;
END $$;
