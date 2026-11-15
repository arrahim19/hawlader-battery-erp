ALTER TABLE "Supplier" ADD COLUMN "productTypeId" UUID;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Supplier_productTypeId_idx" ON "Supplier"("productTypeId");
-- Assign existing suppliers only when their purchase history identifies one category.
UPDATE "Supplier" AS s SET "productTypeId" = history."typeId"::uuid
FROM (
  SELECT p."supplierId", MIN(product."typeId"::text) AS "typeId"
  FROM "Purchase" p
  JOIN "PurchaseItem" item ON item."purchaseId" = p.id
  JOIN "Product" product ON product.id = item."productId"
  GROUP BY p."supplierId" HAVING COUNT(DISTINCT product."typeId") = 1
) history WHERE s.id = history."supplierId";
