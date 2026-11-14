-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TrackingKind" AS ENUM ('BATTERY_UNIT', 'QUANTITY');

-- CreateEnum
CREATE TYPE "IdentificationMethod" AS ENUM ('SERIAL', 'PRODUCTION_DATE', 'BOTH');

-- CreateEnum
CREATE TYPE "BatteryCondition" AS ENUM ('PENDING_INSPECTION', 'GOOD', 'FAULTY', 'SCRAP');

-- CreateEnum
CREATE TYPE "Custody" AS ENUM ('SHOP', 'CUSTOMER', 'SUPPLIER', 'DISPOSED');

-- CreateEnum
CREATE TYPE "Ownership" AS ENUM ('SHOP', 'CUSTOMER', 'DISPOSED');

-- CreateEnum
CREATE TYPE "CommercialState" AS ENUM ('AVAILABLE', 'RESERVED', 'UNAVAILABLE', 'SOLD', 'RETIRED');

-- CreateEnum
CREATE TYPE "StockOrigin" AS ENUM ('PURCHASE', 'REPLACEMENT', 'RETURN', 'OPENING', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReplacementSource" AS ENUM ('BEFORE_SALE', 'CUSTOMER_WARRANTY');

-- CreateEnum
CREATE TYPE "ReplacementStatus" AS ENUM ('PENDING_RETURN', 'SENT_TO_COMPANY', 'UNDER_REVIEW', 'REPLACEMENT_RECEIVED', 'READY_FOR_CUSTOMER_DELIVERY', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "userId" UUID NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "builtIn" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "reason" TEXT,
    "requestId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actorId" UUID,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductType" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trackingKind" "TrackingKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "parentId" UUID,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultSellingPrice" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "defaultPurchasePrice" DECIMAL(20,2),
    "lowStockThreshold" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "typeId" UUID NOT NULL,
    "brandId" UUID,
    "categoryId" UUID,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryProductDetail" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "capacityAh" DECIMAL(10,2) NOT NULL,
    "voltage" DECIMAL(10,2) NOT NULL,
    "identificationMethod" "IdentificationMethod" NOT NULL,
    "defaultWarrantyMonths" INTEGER NOT NULL DEFAULT 0,
    "productId" UUID NOT NULL,

    CONSTRAINT "BatteryProductDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsProductDetail" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "specifications" TEXT,
    "defaultWarrantyMonths" INTEGER NOT NULL DEFAULT 0,
    "productId" UUID NOT NULL,

    CONSTRAINT "PartsProductDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "brandId" UUID,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "type" TEXT NOT NULL,
    "identifier" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customerId" UUID NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatterySet" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "label" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "vehicleId" UUID,

    CONSTRAINT "BatterySet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" UUID NOT NULL,

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "supplierReference" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" DATE NOT NULL,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "additionalCosts" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "costPlan" JSONB NOT NULL DEFAULT '{}',
    "remainderCancelledAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "supplierId" UUID NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "allocatedDiscount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "allocatedCosts" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "expectedUnitCost" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "purchaseId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRemainderCancellation" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "purchaseId" UUID NOT NULL,
    "purchaseItemId" UUID NOT NULL,
    "actorId" UUID NOT NULL,

    CONSTRAINT "PurchaseRemainderCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "receivedDate" DATE NOT NULL,
    "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseId" UUID NOT NULL,
    "postingId" UUID NOT NULL,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "netCost" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "receiptId" UUID NOT NULL,
    "purchaseItemId" UUID NOT NULL,

    CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "origin" "StockOrigin" NOT NULL,
    "originalQuantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" UUID NOT NULL,
    "receiptItemId" UUID,
    "replacementReceiptItemId" UUID,
    "openingItemId" UUID,
    "adjustmentItemId" UUID,
    "returnItemId" UUID,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryUnit" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "internalCode" TEXT NOT NULL,
    "serialNumber" TEXT,
    "normalizedSerial" TEXT,
    "productionDate" DATE,
    "condition" "BatteryCondition" NOT NULL DEFAULT 'PENDING_INSPECTION',
    "custody" "Custody" NOT NULL DEFAULT 'SHOP',
    "ownership" "Ownership" NOT NULL DEFAULT 'SHOP',
    "commercialState" "CommercialState" NOT NULL DEFAULT 'UNAVAILABLE',
    "origin" "StockOrigin" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "reservedCustomerId" UUID,
    "reservedReplacementId" UUID,

    CONSTRAINT "BatteryUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT NOT NULL,
    "bucket" "CommercialState" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "batchId" UUID NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "fromCustody" "Custody",
    "toCustody" "Custody",
    "fromState" "CommercialState",
    "toState" "CommercialState",
    "fromCondition" "BatteryCondition",
    "toCondition" "BatteryCondition",
    "fromOwnership" "Ownership",
    "toOwnership" "Ownership",
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postingId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "batteryUnitId" UUID,
    "reversedMovementId" UUID,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postingId" UUID NOT NULL,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "fromState" "CommercialState",
    "toState" "CommercialState" NOT NULL,
    "valuationImpact" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "adjustmentId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batteryUnitId" UUID,
    "originalBatchId" UUID,

    CONSTRAINT "StockAdjustmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reconciliationReference" TEXT NOT NULL,
    "postingId" UUID NOT NULL,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalanceItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "openingId" UUID NOT NULL,

    CONSTRAINT "OpeningBalanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyPolicy" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "preserveOriginalExpiry" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supplierId" UUID,
    "productId" UUID,

    CONSTRAINT "WarrantyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "invoiceNumber" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "soldAt" TIMESTAMPTZ(3),
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "invoiceSnapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "customerId" UUID NOT NULL,
    "vehicleId" UUID,
    "postingId" UUID,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "costTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "warrantySnapshot" JSONB NOT NULL DEFAULT '{}',
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleUnit" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "coverageStart" DATE NOT NULL,
    "coverageExpiry" DATE NOT NULL,
    "costAtSale" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "releasedAt" TIMESTAMPTZ(3),
    "saleItemId" UUID NOT NULL,
    "batteryUnitId" UUID NOT NULL,
    "batterySetId" UUID,

    CONSTRAINT "SaleUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAllocation" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "saleItemId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "batteryUnitId" UUID,
    "reversedAllocationId" UUID,

    CONSTRAINT "CostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "creditAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleId" UUID NOT NULL,
    "postingId" UUID NOT NULL,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "creditAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "disposition" "CommercialState" NOT NULL,
    "inspection" JSONB NOT NULL,
    "returnId" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "batteryUnitId" UUID,
    "costAllocationId" UUID NOT NULL,

    CONSTRAINT "SalesReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "creditAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "supplierId" UUID NOT NULL,
    "postingId" UUID NOT NULL,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "carryingCost" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "returnId" UUID NOT NULL,
    "receiptItemId" UUID NOT NULL,
    "batteryUnitId" UUID,

    CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "complaint" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "eligibilityReason" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "receivedDate" DATE NOT NULL,
    "originalExpiry" DATE NOT NULL,
    "authorizedExpiry" DATE,
    "receiptSnapshot" JSONB NOT NULL,
    "customerId" UUID NOT NULL,
    "saleUnitId" UUID NOT NULL,
    "faultyUnitId" UUID NOT NULL,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementRecord" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "source" "ReplacementSource" NOT NULL,
    "status" "ReplacementStatus" NOT NULL DEFAULT 'PENDING_RETURN',
    "faultReason" TEXT NOT NULL,
    "outcome" TEXT,
    "outcomeResolvedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "oldUnitId" UUID NOT NULL,
    "warrantyClaimId" UUID,
    "supplierId" UUID NOT NULL,
    "reservedCustomerId" UUID,

    CONSTRAINT "ReplacementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryInspection" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "findings" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "testReadings" JSONB NOT NULL DEFAULT '{}',
    "inspectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacementId" UUID NOT NULL,
    "batteryUnitId" UUID NOT NULL,
    "inspectorId" UUID NOT NULL,

    CONSTRAINT "BatteryInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementDispatch" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "dispatchDate" DATE NOT NULL,
    "reference" TEXT,
    "snapshot" JSONB NOT NULL,
    "supplierId" UUID NOT NULL,
    "postingId" UUID NOT NULL,

    CONSTRAINT "ReplacementDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "returnedAt" TIMESTAMPTZ(3),
    "dispatchId" UUID NOT NULL,
    "replacementId" UUID NOT NULL,
    "oldUnitId" UUID NOT NULL,

    CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementReceipt" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "receivedDate" DATE NOT NULL,
    "reference" TEXT,
    "supplierId" UUID NOT NULL,
    "postingId" UUID NOT NULL,

    CONSTRAINT "ReplacementReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementReceiptItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "inspectionResult" TEXT,
    "inheritedUnitCost" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "policySnapshot" JSONB NOT NULL,
    "receiptId" UUID NOT NULL,
    "replacementId" UUID NOT NULL,
    "dispatchItemId" UUID NOT NULL,
    "oldUnitId" UUID NOT NULL,
    "newUnitId" UUID NOT NULL,

    CONSTRAINT "ReplacementReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementDelivery" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "deliveredAt" TIMESTAMPTZ(3) NOT NULL,
    "recipient" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "replacementId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "newUnitId" UUID NOT NULL,
    "postingId" UUID NOT NULL,

    CONSTRAINT "ReplacementDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementOutcomeEvent" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "replacementId" UUID NOT NULL,
    "postingId" UUID NOT NULL,

    CONSTRAINT "ReplacementOutcomeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "paymentMethod" "PaymentMethod",
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "postingId" UUID NOT NULL,
    "reversedEntryId" UUID,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "entryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "customerId" UUID,
    "supplierId" UUID,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "customerId" UUID,
    "supplierId" UUID,
    "assetAccountId" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "reversedPaymentId" UUID,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "paymentId" UUID NOT NULL,
    "saleId" UUID,
    "purchaseReceiptId" UUID,
    "reversedAllocationId" UUID,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "accountId" UUID NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "incurredDate" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "categoryId" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "reversedExpenseId" UUID,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseSettlement" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "settledAt" TIMESTAMPTZ(3) NOT NULL,
    "expenseId" UUID NOT NULL,
    "assetAccountId" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "reversedSettlementId" UUID,

    CONSTRAINT "ExpenseSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementCharge" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "replacementId" UUID NOT NULL,
    "journalId" UUID,

    CONSTRAINT "ReplacementCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "sourceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationSetting" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "value" JSONB NOT NULL,
    "changedById" UUID NOT NULL,

    CONSTRAINT "ApplicationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSnapshot" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "artifactKey" TEXT,
    "checksum" TEXT,

    CONSTRAINT "DocumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "LoginAttempt_key_key" ON "LoginAttempt"("key");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_code_key" ON "ProductType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_normalizedName_key" ON "Brand"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Category_normalizedName_key" ON "Category"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_identityKey_key" ON "Product"("identityKey");

-- CreateIndex
CREATE INDEX "Product_active_name_idx" ON "Product"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryProductDetail_productId_key" ON "BatteryProductDetail"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PartsProductDetail_productId_key" ON "PartsProductDetail"("productId");

-- CreateIndex
CREATE INDEX "Supplier_phone_idx" ON "Supplier"("phone");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_customerId_identifier_key" ON "Vehicle"("customerId", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Posting_sourceCode_key" ON "Posting"("sourceCode");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_number_key" ON "Purchase"("number");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_orderDate_idx" ON "Purchase"("supplierId", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseItem_purchaseId_lineNumber_key" ON "PurchaseItem"("purchaseId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_number_key" ON "PurchaseReceipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_postingId_key" ON "PurchaseReceipt"("postingId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseId_postedAt_idx" ON "PurchaseReceipt"("purchaseId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptItem_receiptId_purchaseItemId_key" ON "PurchaseReceiptItem"("receiptId", "purchaseItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_receiptItemId_key" ON "StockBatch"("receiptItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_replacementReceiptItemId_key" ON "StockBatch"("replacementReceiptItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_openingItemId_key" ON "StockBatch"("openingItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_adjustmentItemId_key" ON "StockBatch"("adjustmentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_returnItemId_key" ON "StockBatch"("returnItemId");

-- CreateIndex
CREATE INDEX "StockBatch_productId_acquiredAt_idx" ON "StockBatch"("productId", "acquiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryUnit_internalCode_key" ON "BatteryUnit"("internalCode");

-- CreateIndex
CREATE INDEX "BatteryUnit_productionDate_idx" ON "BatteryUnit"("productionDate");

-- CreateIndex
CREATE INDEX "BatteryUnit_productId_commercialState_custody_condition_own_idx" ON "BatteryUnit"("productId", "commercialState", "custody", "condition", "ownership");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryUnit_productId_normalizedSerial_key" ON "BatteryUnit"("productId", "normalizedSerial");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_batchId_location_bucket_key" ON "InventoryBalance"("batchId", "location", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversedMovementId_key" ON "StockMovement"("reversedMovementId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_occurredAt_idx" ON "StockMovement"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_batteryUnitId_occurredAt_idx" ON "StockMovement"("batteryUnitId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_occurredAt_idx" ON "StockMovement"("batchId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_postingId_lineNumber_key" ON "StockMovement"("postingId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_number_key" ON "StockAdjustment"("number");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_postingId_key" ON "StockAdjustment"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_number_key" ON "OpeningBalance"("number");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_postingId_key" ON "OpeningBalance"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalanceItem_deduplicationKey_key" ON "OpeningBalanceItem"("deduplicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyPolicy_code_version_key" ON "WarrantyPolicy"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_postingId_key" ON "Sale"("postingId");

-- CreateIndex
CREATE INDEX "Sale_customerId_soldAt_idx" ON "Sale"("customerId", "soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "SaleItem_saleId_lineNumber_key" ON "SaleItem"("saleId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CostAllocation_reversedAllocationId_key" ON "CostAllocation"("reversedAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_number_key" ON "SalesReturn"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_postingId_key" ON "SalesReturn"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_number_key" ON "SupplierReturn"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_postingId_key" ON "SupplierReturn"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_number_key" ON "WarrantyClaim"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementRecord_number_key" ON "ReplacementRecord"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementRecord_warrantyClaimId_key" ON "ReplacementRecord"("warrantyClaimId");

-- CreateIndex
CREATE INDEX "ReplacementRecord_status_supplierId_createdAt_idx" ON "ReplacementRecord"("status", "supplierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementDispatch_number_key" ON "ReplacementDispatch"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementDispatch_postingId_key" ON "ReplacementDispatch"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementReceipt_number_key" ON "ReplacementReceipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementReceipt_postingId_key" ON "ReplacementReceipt"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementReceiptItem_replacementId_key" ON "ReplacementReceiptItem"("replacementId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementReceiptItem_dispatchItemId_key" ON "ReplacementReceiptItem"("dispatchItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementReceiptItem_newUnitId_key" ON "ReplacementReceiptItem"("newUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementDelivery_number_key" ON "ReplacementDelivery"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementDelivery_replacementId_key" ON "ReplacementDelivery"("replacementId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementDelivery_newUnitId_key" ON "ReplacementDelivery"("newUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementDelivery_postingId_key" ON "ReplacementDelivery"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementOutcomeEvent_postingId_key" ON "ReplacementOutcomeEvent"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_postingId_key" ON "JournalEntry"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversedEntryId_key" ON "JournalEntry"("reversedEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_createdAt_idx" ON "JournalLine"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalLine_customerId_createdAt_idx" ON "JournalLine"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalLine_supplierId_createdAt_idx" ON "JournalLine"("supplierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_number_key" ON "Payment"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_journalId_key" ON "Payment"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversedPaymentId_key" ON "Payment"("reversedPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_reversedAllocationId_key" ON "PaymentAllocation"("reversedAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_journalId_key" ON "Expense"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reversedExpenseId_key" ON "Expense"("reversedExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseSettlement_journalId_key" ON "ExpenseSettlement"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseSettlement_reversedSettlementId_key" ON "ExpenseSettlement"("reversedSettlementId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementCharge_journalId_key" ON "ReplacementCharge"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_actorId_operation_key_key" ON "IdempotencyRecord"("actorId", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationSetting_key_key" ON "ApplicationSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSnapshot_sourceType_sourceId_kind_version_key" ON "DocumentSnapshot"("sourceType", "sourceId", "kind", "version");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryProductDetail" ADD CONSTRAINT "BatteryProductDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsProductDetail" ADD CONSTRAINT "PartsProductDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatterySet" ADD CONSTRAINT "BatterySet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatterySet" ADD CONSTRAINT "BatterySet_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRemainderCancellation" ADD CONSTRAINT "PurchaseRemainderCancellation_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRemainderCancellation" ADD CONSTRAINT "PurchaseRemainderCancellation_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRemainderCancellation" ADD CONSTRAINT "PurchaseRemainderCancellation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "PurchaseReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_replacementReceiptItemId_fkey" FOREIGN KEY ("replacementReceiptItemId") REFERENCES "ReplacementReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_openingItemId_fkey" FOREIGN KEY ("openingItemId") REFERENCES "OpeningBalanceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_adjustmentItemId_fkey" FOREIGN KEY ("adjustmentItemId") REFERENCES "StockAdjustmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "SalesReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryUnit" ADD CONSTRAINT "BatteryUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryUnit" ADD CONSTRAINT "BatteryUnit_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryUnit" ADD CONSTRAINT "BatteryUnit_reservedCustomerId_fkey" FOREIGN KEY ("reservedCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryUnit" ADD CONSTRAINT "BatteryUnit_reservedReplacementId_fkey" FOREIGN KEY ("reservedReplacementId") REFERENCES "ReplacementRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batteryUnitId_fkey" FOREIGN KEY ("batteryUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversedMovementId_fkey" FOREIGN KEY ("reversedMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_batteryUnitId_fkey" FOREIGN KEY ("batteryUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_originalBatchId_fkey" FOREIGN KEY ("originalBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceItem" ADD CONSTRAINT "OpeningBalanceItem_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "OpeningBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyPolicy" ADD CONSTRAINT "WarrantyPolicy_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyPolicy" ADD CONSTRAINT "WarrantyPolicy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleUnit" ADD CONSTRAINT "SaleUnit_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleUnit" ADD CONSTRAINT "SaleUnit_batteryUnitId_fkey" FOREIGN KEY ("batteryUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleUnit" ADD CONSTRAINT "SaleUnit_batterySetId_fkey" FOREIGN KEY ("batterySetId") REFERENCES "BatterySet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_batteryUnitId_fkey" FOREIGN KEY ("batteryUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_reversedAllocationId_fkey" FOREIGN KEY ("reversedAllocationId") REFERENCES "CostAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_batteryUnitId_fkey" FOREIGN KEY ("batteryUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_costAllocationId_fkey" FOREIGN KEY ("costAllocationId") REFERENCES "CostAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SupplierReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "PurchaseReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_batteryUnitId_fkey" FOREIGN KEY ("batteryUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_saleUnitId_fkey" FOREIGN KEY ("saleUnitId") REFERENCES "SaleUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_faultyUnitId_fkey" FOREIGN KEY ("faultyUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementRecord" ADD CONSTRAINT "ReplacementRecord_oldUnitId_fkey" FOREIGN KEY ("oldUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementRecord" ADD CONSTRAINT "ReplacementRecord_warrantyClaimId_fkey" FOREIGN KEY ("warrantyClaimId") REFERENCES "WarrantyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementRecord" ADD CONSTRAINT "ReplacementRecord_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementRecord" ADD CONSTRAINT "ReplacementRecord_reservedCustomerId_fkey" FOREIGN KEY ("reservedCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryInspection" ADD CONSTRAINT "BatteryInspection_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "ReplacementRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryInspection" ADD CONSTRAINT "BatteryInspection_batteryUnitId_fkey" FOREIGN KEY ("batteryUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryInspection" ADD CONSTRAINT "BatteryInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementDispatch" ADD CONSTRAINT "ReplacementDispatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementDispatch" ADD CONSTRAINT "ReplacementDispatch_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "ReplacementDispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "ReplacementRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_oldUnitId_fkey" FOREIGN KEY ("oldUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementReceipt" ADD CONSTRAINT "ReplacementReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementReceipt" ADD CONSTRAINT "ReplacementReceipt_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementReceiptItem" ADD CONSTRAINT "ReplacementReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "ReplacementReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementReceiptItem" ADD CONSTRAINT "ReplacementReceiptItem_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "ReplacementRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementReceiptItem" ADD CONSTRAINT "ReplacementReceiptItem_dispatchItemId_fkey" FOREIGN KEY ("dispatchItemId") REFERENCES "DispatchItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementReceiptItem" ADD CONSTRAINT "ReplacementReceiptItem_oldUnitId_fkey" FOREIGN KEY ("oldUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementReceiptItem" ADD CONSTRAINT "ReplacementReceiptItem_newUnitId_fkey" FOREIGN KEY ("newUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementDelivery" ADD CONSTRAINT "ReplacementDelivery_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "ReplacementRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementDelivery" ADD CONSTRAINT "ReplacementDelivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementDelivery" ADD CONSTRAINT "ReplacementDelivery_newUnitId_fkey" FOREIGN KEY ("newUnitId") REFERENCES "BatteryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementDelivery" ADD CONSTRAINT "ReplacementDelivery_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementOutcomeEvent" ADD CONSTRAINT "ReplacementOutcomeEvent_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "ReplacementRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementOutcomeEvent" ADD CONSTRAINT "ReplacementOutcomeEvent_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedEntryId_fkey" FOREIGN KEY ("reversedEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversedPaymentId_fkey" FOREIGN KEY ("reversedPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_reversedAllocationId_fkey" FOREIGN KEY ("reversedAllocationId") REFERENCES "PaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reversedExpenseId_fkey" FOREIGN KEY ("reversedExpenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_reversedSettlementId_fkey" FOREIGN KEY ("reversedSettlementId") REFERENCES "ExpenseSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementCharge" ADD CONSTRAINT "ReplacementCharge_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "ReplacementRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementCharge" ADD CONSTRAINT "ReplacementCharge_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationSetting" ADD CONSTRAINT "ApplicationSetting_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
