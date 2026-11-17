BEGIN;

LOCK TABLE "Sale" IN SHARE ROW EXCLUSIVE MODE;

-- Refuse to truncate a number or reuse a previously issued reference.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Sale"
    WHERE "invoiceNumber" ~ '^HWB-[0-9]{6}$'
      AND substring("invoiceNumber" FROM 5)::integer > 9999
  ) OR (SELECT last_value FROM "Sale_invoice_number_seq") > 9999 THEN
    RAISE EXCEPTION 'Four-digit invoice number capacity exceeded';
  END IF;
END $$;

CREATE TEMP TABLE invoice_renumber ON COMMIT DROP AS
SELECT id, "invoiceNumber" AS old_number,
  'HB-' || lpad(substring("invoiceNumber" FROM 5)::integer::text, 4, '0') AS new_number
FROM "Sale" WHERE "invoiceNumber" ~ '^HWB-[0-9]{6}$';

INSERT INTO "AuditLog" (id, "updatedAt", action, "resourceType", "resourceId", reason, "requestId", metadata)
SELECT gen_random_uuid(), now(), 'SALE_INVOICE_RENUMBERED', 'Sale', id::text,
  'Standardize invoice references to HB followed by four digits',
  'migration:202611170001_hb_invoice_numbers',
  jsonb_build_object('oldInvoiceNumber', old_number, 'invoiceNumber', new_number)
FROM invoice_renumber;

UPDATE "Sale" s SET "invoiceNumber" = n.new_number, "updatedAt" = now()
FROM invoice_renumber n WHERE s.id = n.id;

UPDATE "IdempotencyRecord" r
SET "responseBody" = jsonb_set(r."responseBody", '{invoiceNumber}', to_jsonb(n.new_number)),
  "updatedAt" = now()
FROM invoice_renumber n
WHERE r.operation = 'SALE_COMPLETE' AND r."sourceId" = n.id;

ALTER SEQUENCE "Sale_invoice_number_seq" MAXVALUE 9999 NO CYCLE;

COMMIT;
