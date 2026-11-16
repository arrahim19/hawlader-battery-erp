BEGIN;

LOCK TABLE "Sale" IN SHARE ROW EXCLUSIVE MODE;

CREATE SEQUENCE "Sale_invoice_number_seq" AS integer
  START WITH 1 MINVALUE 1 MAXVALUE 999999 NO CYCLE;

DO $$
DECLARE
  last_number integer;
  legacy_count bigint;
BEGIN
  SELECT COALESCE(MAX(substring("invoiceNumber" FROM 5)::integer), 0)
  INTO last_number FROM "Sale" WHERE "invoiceNumber" ~ '^HWB-[0-9]{6}$';
  SELECT count(*) INTO legacy_count FROM "Sale"
  WHERE "invoiceNumber" IS NOT NULL AND "invoiceNumber" !~ '^HWB-[0-9]{6}$';
  IF last_number + legacy_count > 999999 THEN
    RAISE EXCEPTION 'Six-digit invoice number capacity exceeded';
  END IF;
END $$;

CREATE TEMP TABLE invoice_renumber ON COMMIT DROP AS
WITH existing AS (
  SELECT COALESCE(MAX(substring("invoiceNumber" FROM 5)::integer), 0) AS last_number
  FROM "Sale" WHERE "invoiceNumber" ~ '^HWB-[0-9]{6}$'
)
SELECT s.id, s."invoiceNumber" AS old_number,
  'HWB-' || lpad((existing.last_number + row_number() OVER (ORDER BY s."createdAt", s.id))::text, 6, '0') AS new_number
FROM "Sale" s CROSS JOIN existing
WHERE s."invoiceNumber" IS NOT NULL AND s."invoiceNumber" !~ '^HWB-[0-9]{6}$';

-- Preserve the previous numbers as history without changing financial records.
INSERT INTO "AuditLog" (id, "updatedAt", action, "resourceType", "resourceId", reason, "requestId", metadata)
SELECT gen_random_uuid(), now(), 'SALE_INVOICE_RENUMBERED', 'Sale', id::text,
  'Standardize invoice numbers to HWB followed by six digits',
  'migration:202611160004_hwb_invoice_numbers',
  jsonb_build_object('oldInvoiceNumber', old_number, 'invoiceNumber', new_number)
FROM invoice_renumber;

UPDATE "Sale" s SET "invoiceNumber" = n.new_number, "updatedAt" = now()
FROM invoice_renumber n WHERE s.id = n.id;

-- Retrying an earlier sale must return its current number, without reposting it.
UPDATE "IdempotencyRecord" r
SET "responseBody" = jsonb_set(r."responseBody", '{invoiceNumber}', to_jsonb(n.new_number)),
  "updatedAt" = now()
FROM invoice_renumber n
WHERE r.operation = 'SALE_COMPLETE' AND r."sourceId" = n.id;

SELECT setval('"Sale_invoice_number_seq"',
  GREATEST(COALESCE(MAX(substring("invoiceNumber" FROM 5)::integer), 0), 1),
  COALESCE(MAX(substring("invoiceNumber" FROM 5)::integer), 0) > 0)
FROM "Sale" WHERE "invoiceNumber" ~ '^HWB-[0-9]{6}$';

COMMIT;
