export interface CurrentUser {
  id: string;
  name: string;
  login: string;
  roles: string[];
  permissions: string[];
}
export interface SupplierRecord {
  productTypeId: string | null;
  productType: { id: string; name: string } | null;
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
}
export interface SupplierList {
  items: SupplierRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; active: number };
}
export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  active: boolean;
  createdAt: string;
  vehicles: { id: string; type: string; identifier: string | null }[];
  totalSales: string;
  due: string;
}
export interface CustomerList {
  items: CustomerRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number;
    active: number;
    credit: number;
    totalSales: string;
    totalDue: string;
  };
}
export type ProductTrackingKind = "BATTERY_UNIT" | "QUANTITY";
export interface ProductTypeRecord {
  id: string;
  name: string;
  trackingKind: ProductTrackingKind;
  productCount: number;
}
export interface CatalogFacet {
  id: string;
  name: string;
  productCount: number;
  typeIds?: string[];
  productCountsByType?: Record<string, number>;
}
export interface CatalogMetadata {
  types: ProductTypeRecord[];
  brands: CatalogFacet[];
  categories: CatalogFacet[];
  totalProducts: number;
}
export interface CatalogProduct {
  id: string;
  name: string;
  model: string;
  unit: string;
  active: boolean;
  type: { id: string; name: string; trackingKind: ProductTrackingKind };
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  defaultSellingPrice: string;
  latestPurchasePrice?: string | null;
  lowStockThreshold: string;
  warrantyMonths: number;
  capacityAh: string | null;
  voltage: string | null;
  specifications: string | null;
  stock: {
    total: string;
    available: string;
    replaceable: string;
    reserved: string;
    sentToCompany: string;
  };
}
export interface ProductList {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
}
export interface PurchaseOptions {
  productNames?: { id: string; name: string; typeId: string }[];
  types: Pick<ProductTypeRecord, "id" | "name" | "trackingKind">[];
  products: (Pick<CatalogProduct, "id" | "name" | "model" | "unit" | "type"> & {
    capacityAh?: string | null;
    voltage?: string | null;
    specifications?: string | null;
    warrantyMonths?: number;
  })[];
  suppliers: {
    id: string;
    name: string;
    company: string | null;
    productTypeId: string | null;
  }[];
  paymentAccounts: { id: string; name: string; paymentMethod: string | null }[];
}
export interface SalesOptions {
  types: Pick<ProductTypeRecord, "id" | "name" | "trackingKind">[];
  products: (Pick<
    CatalogProduct,
    "id" | "name" | "model" | "unit" | "type" | "defaultSellingPrice"
  > & {
    availableQuantity: string;
  })[];
  customers: CustomerRecord[];
  paymentAccounts: { id: string; name: string; paymentMethod: string | null }[];
}
export interface CompletedSale {
  id: string;
  invoiceNumber: string;
  customerId: string;
  subtotal: string;
  total: string;
  paid: string;
  due: string;
  quantity: number;
}
export interface SalesList {
  items: {
    id: string;
    invoiceNumber: string | null;
    customer: { id: string; name: string; phone: string };
    saleDate: string | null;
    status: string;
    subtotal: string;
    total: string;
    paid: string;
    due: string;
    quantity: string;
    itemCount: number;
  }[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ReceivedPurchase {
  id: string;
  number: string;
  receiptId: string;
  status: string;
  total: string;
  paid: string;
  due: string;
  quantity: number;
}
export interface PurchaseList {
  items: {
    id: string;
    number: string;
    supplierReference: string | null;
    supplier: { id: string; name: string };
    purchaseDate: string;
    status: string;
    itemCount: number;
    quantity: string;
    total: string;
    paid: string;
    due: string;
  }[];
  total: number;
  page: number;
  pageSize: number;
}
export interface RecentPurchases {
  items: {
    id: string;
    number: string;
    purchaseDate: string;
    supplierReference: string | null;
    supplier: { name: string; company: string | null };
    items: {
      id: string;
      name: string;
      typeName: string;
      model: string;
      capacityAh: string | null;
      voltage: string | null;
      specifications: string | null;
      warrantyMonths: number;
      quantity: string;
      unitPrice: string;
      total: string;
    }[];
  }[];
}
export interface DashboardData {
  businessDate: string;
  from: string;
  to: string;
  counts: {
    products: number;
    customers: number;
    suppliers: number;
    availableStock: string;
    pendingReplacements: number;
    sentToCompany: number;
    replacementsReceived: number;
    lowStock: number;
  };
  financials?: {
    availableStockPurchaseValue: string;
    todaySales: string;
    todayPurchases: string;
    todayCashReceived: string;
    grossProfit: string;
    customerDues: string;
    supplierDues: string;
  };
  recentSales: {
    id: string;
    invoiceNumber: string | null;
    soldAt: string | null;
    customer: string;
    total: string;
    status: string;
  }[];
  lowStock: { id: string; name: string; quantity: string; threshold: string }[];
  salesTrend: { date: string; amount: string; grossProfit?: string }[];
  stock?: {
    batteriesAvailable: number;
    partsAvailable: string;
    accountedUnits: string;
    replaceable: number;
    reserved: number;
  };
  replacementStages?: {
    total: number;
    pendingReturn: number;
    sentToCompany: number;
    underReview: number;
    received: number;
    readyForDelivery: number;
  };
}
