-- Voltage is optional when defining a battery product.
ALTER TABLE "BatteryProductDetail" ALTER COLUMN "voltage" DROP NOT NULL;
