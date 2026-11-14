CREATE TABLE "ProductTypeCategory" (
  "typeId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  CONSTRAINT "ProductTypeCategory_pkey" PRIMARY KEY ("typeId", "categoryId"),
  CONSTRAINT "ProductTypeCategory_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductTypeCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "ProductTypeCategory" ("typeId", "categoryId")
SELECT DISTINCT "typeId", "categoryId" FROM "Product" WHERE "categoryId" IS NOT NULL;
