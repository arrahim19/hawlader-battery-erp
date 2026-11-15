-- Product.id remains the stable key used by stock and transaction relations.
-- Remove the redundant generated display code and its unique index.
ALTER TABLE "Product" DROP COLUMN "sku";

-- Existing sales retain their product identity, names, quantities and prices.
UPDATE "SaleItem"
SET "productSnapshot" = "productSnapshot" - 'sku'
WHERE "productSnapshot" ? 'sku';
