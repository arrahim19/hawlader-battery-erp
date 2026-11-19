BEGIN;

LOCK TABLE "Purchase" IN SHARE ROW EXCLUSIVE MODE;

CREATE SEQUENCE "Purchase_number_seq" AS integer
  START WITH 1 MINVALUE 1 MAXVALUE 999999 NO CYCLE;

DO $$
DECLARE
  last_number integer;
  legacy_count bigint;
BEGIN
  SELECT COALESCE(MAX(substring(number FROM 5)::integer), 0)
  INTO last_number FROM "Purchase" WHERE number ~ '^PUR-[0-9]{6}$';
  SELECT count(*) INTO legacy_count FROM "Purchase"
  WHERE number !~ '^PUR-[0-9]{6}$';
  IF last_number + legacy_count > 999999 THEN
    RAISE EXCEPTION 'Six-digit purchase number capacity exceeded';
  END IF;
END $$;

CREATE TEMP TABLE purchase_renumber ON COMMIT DROP AS
WITH existing AS (
  SELECT COALESCE(MAX(substring(number FROM 5)::integer), 0) AS last_number
  FROM "Purchase" WHERE number ~ '^PUR-[0-9]{6}$'
)
SELECT p.id, p.number AS old_number,
  'PUR-' || lpad((existing.last_number + row_number() OVER (
    ORDER BY p."orderDate", p."createdAt", p.id
  ))::text, 6, '0') AS new_number
FROM "Purchase" p CROSS JOIN existing
WHERE p.number !~ '^PUR-[0-9]{6}$';

INSERT INTO "AuditLog" (id, "updatedAt", action, "resourceType", "resourceId", reason, "requestId", metadata)
SELECT gen_random_uuid(), now(), 'PURCHASE_RENUMBERED', 'Purchase', id::text,
  'Standardize purchase numbers to PUR followed by six digits',
  'migration:202611190002_purchase_numbers',
  jsonb_build_object('oldNumber', old_number, 'number', new_number)
FROM purchase_renumber;

UPDATE "Purchase" p SET number = n.new_number, "updatedAt" = now()
FROM purchase_renumber n WHERE p.id = n.id;

-- Replaying an existing receipt must return the current purchase number.
UPDATE "IdempotencyRecord" r
SET "responseBody" = jsonb_set(r."responseBody", '{number}', to_jsonb(n.new_number)),
  "updatedAt" = now()
FROM purchase_renumber n, "PurchaseReceipt" receipt
WHERE r.operation = 'PURCHASE_RECEIVE'
  AND receipt."purchaseId" = n.id AND r."sourceId" = receipt.id;

SELECT setval('"Purchase_number_seq"',
  GREATEST(COALESCE(MAX(substring(number FROM 5)::integer), 0), 1),
  COALESCE(MAX(substring(number FROM 5)::integer), 0) > 0)
FROM "Purchase" WHERE number ~ '^PUR-[0-9]{6}$';

COMMIT;
