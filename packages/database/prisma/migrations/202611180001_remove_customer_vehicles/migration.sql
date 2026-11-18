BEGIN;

-- Vehicle tracking has been removed. Preserve sales and battery sets while
-- removing only their obsolete vehicle associations and vehicle records.
UPDATE "Sale" SET "vehicleId" = NULL WHERE "vehicleId" IS NOT NULL;
UPDATE "BatterySet" SET "vehicleId" = NULL WHERE "vehicleId" IS NOT NULL;
DELETE FROM "Vehicle";

-- Keep the empty relation readable during rolling deployments so older
-- clients can still load customers. No client may persist vehicle data.
ALTER TABLE "Vehicle" ADD CONSTRAINT "vehicle_recording_disabled" CHECK (false);

COMMIT;
