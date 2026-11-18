BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "Supplier" DROP COLUMN "address";

-- Remove supplier addresses retained in deleted-supplier snapshots.
ALTER TABLE "AuditLog" DISABLE TRIGGER "audit_immutable";
UPDATE "AuditLog"
SET "metadata" = ("metadata" #- '{supplier,address}') - 'address'
WHERE "resourceType" = 'Supplier'
  AND ("metadata" #> '{supplier,address}' IS NOT NULL OR "metadata" ? 'address');
ALTER TABLE "AuditLog" ENABLE TRIGGER "audit_immutable";

COMMIT;
