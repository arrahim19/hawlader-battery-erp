"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  List,
  LoaderCircle,
  PackageOpen,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  ModuleTabs,
  Panel,
  SummaryRows,
} from "@/components/reference-ui";
import { useSession } from "@/components/session-provider";
import {
  post,
  type PurchaseOptions,
  type PurchaseList,
  type ReceivedPurchase,
  type CatalogMetadata,
  type CatalogProduct,
} from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { todayInDhaka } from "@/lib/use-dashboard";
import { cents, decimalAmount } from "@/lib/purchase-amounts";
import { money } from "@/lib/utils";
import { ProductForm } from "./catalog-forms";

type Identity = { serialNumber?: string; productionDate?: string };
type CartItem = {
  productId: string;
  name: string;
  typeName: string;
  quantity: number;
  unitPrice: string;
  identities?: Identity[];
};

export function PurchasesView({
  preview,
  view = "",
  loading = false,
  moduleError = "",
}: {
  preview: boolean;
  view?: string;
  loading?: boolean;
  moduleError?: string;
}) {
  const user = useSession();
  const [revision, setRevision] = useState(0);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductTypeId, setNewProductTypeId] = useState("");
  const [identityOpen, setIdentityOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [identityPage, setIdentityPage] = useState(0);
  const [cartPage, setCartPage] = useState(0);
  const [cartPageSize, setCartPageSize] = useState(3);
  const [mobileSection, setMobileSection] = useState(0);
  const formGrid = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const options = useCatalogResource<PurchaseOptions>(
    preview || loading || view === "list" ? null : "/purchases/options",
    revision,
  );
  const listing = useCatalogResource<PurchaseList>(
    !preview && !loading && view === "list" ? `/purchases?page=${page}` : null,
    revision,
  );
  const catalog = useCatalogResource<CatalogMetadata>(
    !preview && newProductOpen ? "/catalog" : null,
    revision,
  );
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayInDhaka);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState("due");
  const [partialPaid, setPartialPaid] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [received, setReceived] = useState<ReceivedPurchase | null>(null);
  const requestKey = useRef<string | null>(null);
  const types = options.data?.types ?? [];
  const filteredProducts =
    options.data?.products.filter((item) => item.type.id === productTypeId) ??
    [];
  const product = filteredProducts.find((item) => item.id === productId);
  const individual = product?.type.trackingKind === "BATTERY_UNIT";
  const totalCents = cart.reduce(
    (sum, item) => sum + cents(item.unitPrice) * BigInt(item.quantity),
    BigInt(0),
  );
  const total = decimalAmount(totalCents);
  const paid =
    paymentType === "full"
      ? total
      : paymentType === "partial"
        ? partialPaid || "0.00"
        : "0.00";
  const due = decimalAmount(totalCents - cents(paid));
  const canPay = Boolean(user?.permissions.includes("finance.write"));
  const canReceive = Boolean(user?.permissions.includes("inventory.receive"));
  const canDefineProduct =
    preview || Boolean(user?.permissions.includes("catalog.write"));
  const current = view === "list" ? "list" : "new";
  const cartPages = Math.max(1, Math.ceil(cart.length / cartPageSize));
  const cartIndex = Math.min(cartPage, cartPages - 1);
  const cartRows = cart.slice(
    cartIndex * cartPageSize,
    (cartIndex + 1) * cartPageSize,
  );
  useEffect(() => {
    if (current !== "new") return;
    const panel = formGrid.current?.querySelector(".purchase-items");
    if (!panel) return;
    const observer = new ResizeObserver(([entry]) => {
      setCartPageSize(
        Math.max(
          1,
          Math.min(6, Math.floor((entry.contentRect.height - 112) / 64)),
        ),
      );
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [current]);
  const unitIndex = Math.max(0, Math.min(identityPage, quantity - 1));
  const identityComplete = (unit: Identity) =>
    (product?.identificationMethod === "PRODUCTION_DATE" ||
      Boolean(unit.serialNumber?.trim())) &&
    (product?.identificationMethod === "SERIAL" ||
      Boolean(unit.productionDate));
  const identityCount = identities
    .slice(0, quantity)
    .filter(identityComplete).length;
  function productSaved(created: CatalogProduct) {
    setProductTypeId(created.type.id);
    setProductId(created.id);
    setIdentities([]);
    setIdentityPage(0);
    setNewProductOpen(false);
    setRevision((value) => value + 1);
    setError("");
  }
  function addItem() {
    setError("");
    if (
      !product ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10000 ||
      !/^\d{1,14}(?:\.\d{1,2})?$/.test(unitPrice)
    ) {
      setError("পণ্য, সঠিক quantity ও purchase price দিন।");
      return;
    }
    if (cart.some((item) => item.productId === product.id)) {
      setError(
        "একই পণ্য আগে তালিকায় আছে। পুরোনো লাইন সরিয়ে সঠিক মোট quantity দিয়ে যোগ করুন।",
      );
      return;
    }
    if (individual && quantity > 500) {
      setError("একবারে সর্বোচ্চ ৫০০ ব্যাটারি গ্রহণ করুন।");
      return;
    }
    const units = Array.from(
      { length: quantity },
      (_, index) => identities[index] ?? {},
    );
    if (individual && units.some((unit) => !identityComplete(unit))) {
      setError("প্রতিটি ব্যাটারির প্রয়োজনীয় পরিচয় দিন।");
      setIdentityPage(units.findIndex((unit) => !identityComplete(unit)));
      setIdentityOpen(true);
      return;
    }
    setCartPage(Math.floor(cart.length / cartPageSize));
    setCart([
      ...cart,
      {
        productId: product.id,
        name: product.name,
        typeName: product.type.name,
        quantity,
        unitPrice,
        ...(individual
          ? {
              identities: units.map((unit) => ({
                ...(unit.serialNumber?.trim()
                  ? { serialNumber: unit.serialNumber.trim() }
                  : {}),
                ...(unit.productionDate
                  ? { productionDate: unit.productionDate }
                  : {}),
              })),
            }
          : {}),
      },
    ]);
    setProductId("");
    setQuantity(1);
    setUnitPrice("");
    setIdentities([]);
  }
  function identity(index: number, field: keyof Identity, value: string) {
    setIdentities((previous) => {
      const result = [...previous];
      result[index] = { ...result[index], [field]: value };
      return result;
    });
  }
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || saving) return;
    setError("");
    setReceived(null);
    if (!supplierId || !cart.length) {
      setError("সাপ্লায়ার নির্বাচন করুন এবং তালিকায় অন্তত একটি পণ্য যোগ করুন।");
      return;
    }
    if (
      cents(paid) > totalCents ||
      (paymentType === "partial" && cents(paid) <= BigInt(0))
    ) {
      setError("Paid amount সঠিকভাবে দিন।");
      return;
    }
    requestKey.current ??= crypto.randomUUID();
    setSaving(true);
    try {
      const result = await post<ReceivedPurchase>(
        "/purchases/receive",
        {
          supplierId,
          purchaseDate,
          reference,
          notes,
          items: cart.map(({ productId, quantity, unitPrice, identities }) => ({
            productId,
            quantity,
            unitPrice,
            ...(identities ? { identities } : {}),
          })),
          paidAmount: paid,
          ...(cents(paid) > BigInt(0)
            ? {
                paymentAccountId:
                  paymentAccountId || options.data?.paymentAccounts[0]?.id,
              }
            : {}),
        },
        { "Idempotency-Key": requestKey.current },
      );
      setReceived(result);
      setCart([]);
      setPaymentType("due");
      setPartialPaid("");
      setReference("");
      setNotes("");
      requestKey.current = null;
      setRevision((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Purchase সেভ করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setSaving(false);
    }
  }
  const loadError = options.error || listing.error;
  const listLoading = loading || listing.loading;
  const pages = Math.max(1, Math.ceil((listing.data?.total ?? 0) / 20));
  return (
    <div
      aria-busy={loading || options.loading || listing.loading}
      className={
        current === "new"
          ? "purchase-workspace purchase-page"
          : "purchase-workspace purchase-list-page"
      }
    >
      <ModuleTabs
        moduleId="purchases"
        current={current}
        preview={preview}
        items={[
          { id: "new", label: "New Purchase", icon: Plus },
          { id: "list", label: "Purchase List", icon: List },
        ]}
      />
      <div className="purchase-notices">
        {received ? (
          <div
            role="status"
            className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            Purchase {received.number} সেভ হয়েছে। {received.quantity} pcs স্টকে
            যোগ হয়েছে।{" "}
            <Link className="font-semibold underline" href="/inventory">
              Inventory / Stock দেখুন
            </Link>
          </div>
        ) : null}
        {error || loadError || moduleError ? (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            <span>{error || loadError || moduleError}</span>
            {loadError ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevision((value) => value + 1)}
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {current === "list" ? (
        <Panel title="Purchase List" className="purchase-list-panel">
          <div className="purchase-list-body" aria-busy={listLoading}>
            <div className="erp-table-wrap">
              <table className="erp-table">
                <caption className="sr-only">Purchases</caption>
                <colgroup>
                  {[18, 17, 12, 6, 6, 11, 10, 10, 10].map((width, index) => (
                    <col key={index} style={{ width: `${width}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {[
                      "Purchase",
                      "Supplier",
                      "Date",
                      "Items",
                      "Qty",
                      "Total",
                      "Paid",
                      "Due",
                      "Status",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listing.data?.items.map((purchase) => (
                    <tr key={purchase.id}>
                      <td className="max-w-56 break-all">
                        {purchase.number}
                        {purchase.supplierReference ? (
                          <small className="mt-1 block">
                            {purchase.supplierReference}
                          </small>
                        ) : null}
                      </td>
                      <td>{purchase.supplier.name}</td>
                      <td>{purchase.purchaseDate}</td>
                      <td>{purchase.itemCount}</td>
                      <td>{purchase.quantity}</td>
                      <td>{money(purchase.total)}</td>
                      <td>{money(purchase.paid)}</td>
                      <td>{money(purchase.due)}</td>
                      <td>{purchase.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {listLoading ? (
              <div className="purchase-list-message" role="status">
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                <p>Loading purchases...</p>
              </div>
            ) : !listing.data?.items.length ? (
              <div className="purchase-list-message">
                <PackageOpen aria-hidden="true" />
                <p>
                  {listing.error
                    ? "Unable to load purchases"
                    : "No records to display"}
                </p>
                <span>
                  {listing.error
                    ? "Retry to load the purchase list."
                    : "Purchase গ্রহণ করলে তালিকায় দেখা যাবে।"}
                </span>
              </div>
            ) : null}
          </div>
          <div className="erp-pager">
            <span>
              Page {page} / {pages}
            </span>
            <div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous purchase page"
                disabled={page <= 1 || listLoading}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next purchase page"
                disabled={page >= pages || listLoading}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <form onSubmit={receive}>
          <nav className="purchase-mobile-tabs" aria-label="Purchase sections">
            {["Details", `Items (${cart.length})`, "Payment"].map(
              (label, index) => (
                <Button
                  key={index}
                  type="button"
                  size="sm"
                  variant={mobileSection === index ? "default" : "outline"}
                  aria-pressed={mobileSection === index}
                  onClick={() => {
                    formGrid.current
                      ?.querySelectorAll<HTMLElement>(
                        ".purchase-details, .purchase-items, .erp-form-side",
                      )
                      [index]?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                        inline: "start",
                      });
                  }}
                >
                  {label}
                </Button>
              ),
            )}
          </nav>
          <fieldset
            disabled={saving || loading || options.loading}
            className="purchase-fieldset"
          >
            <legend className="sr-only">Purchase receiving</legend>
            <div
              ref={formGrid}
              className="erp-form-grid"
              onScroll={(event) => {
                const element = event.currentTarget;
                setMobileSection(
                  Math.max(
                    0,
                    Math.min(
                      2,
                      Math.round(
                        element.scrollLeft / (element.clientWidth + 12),
                      ),
                    ),
                  ),
                );
              }}
            >
              <div className="erp-form-main">
                <Panel
                  title="New Purchase"
                  className="purchase-details"
                  action={
                    !loading && options.data?.suppliers.length === 0 ? (
                      <Link
                        className="text-xs text-amber-700 underline"
                        href="/suppliers/new"
                      >
                        সাপ্লায়ার যোগ করুন
                      </Link>
                    ) : null
                  }
                >
                  <div className="erp-form-body">
                    <div className="purchase-basics grid gap-4 md:grid-cols-3">
                      <Field label="Supplier" required>
                        <select
                          aria-label="Purchase supplier"
                          value={supplierId}
                          onChange={(event) =>
                            setSupplierId(event.target.value)
                          }
                          required
                        >
                          <option value="">সাপ্লায়ার নির্বাচন করুন</option>
                          {options.data?.suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                              {supplier.company ? " · " + supplier.company : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Purchase Date" required>
                        <input
                          type="date"
                          value={purchaseDate}
                          onChange={(event) =>
                            setPurchaseDate(event.target.value)
                          }
                          required
                        />
                      </Field>
                      <Field label="Invoice / Challan No.">
                        <input
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                          maxLength={160}
                        />
                      </Field>
                    </div>
                    <div className="purchase-product-heading mt-5 mb-3 flex items-center justify-between gap-3">
                      <h3 className="erp-section-title mb-0!">Add Products</h3>
                      {canDefineProduct ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setNewProductTypeId(productTypeId);
                            setNewProductOpen(true);
                          }}
                        >
                          <Plus />
                          New Product
                        </Button>
                      ) : null}
                    </div>
                    <div className="erp-add-products">
                      <Field
                        label="Product Type"
                        className="purchase-type-field"
                      >
                        <select
                          aria-label="Purchase product type"
                          value={productTypeId}
                          disabled={!types.length}
                          onChange={(event) => {
                            setProductTypeId(event.target.value);
                            setProductId("");
                            setQuantity(1);
                            setUnitPrice("");
                            setIdentities([]);
                            setIdentityPage(0);
                            setError("");
                          }}
                        >
                          <option value="">পণ্যের ধরন নির্বাচন করুন</option>
                          {types.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Product" className="purchase-product-field">
                        <select
                          aria-label="Purchase product"
                          value={productId}
                          disabled={!productTypeId || !filteredProducts.length}
                          onChange={(event) => {
                            setProductId(event.target.value);
                            setIdentities([]);
                            setIdentityPage(0);
                          }}
                        >
                          <option value="">
                            {!productTypeId
                              ? "আগে পণ্যের ধরন নির্বাচন করুন"
                              : !filteredProducts.length
                                ? "এই ধরনে কোনো পণ্য নেই"
                                : "পণ্য নির্বাচন করুন"}
                          </option>
                          {filteredProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                              {product.model ? " · " + product.model : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Qty" className="purchase-quantity-field">
                        <input
                          aria-label="Purchase quantity"
                          type="number"
                          min="1"
                          max={individual ? 500 : 10000}
                          step="1"
                          value={quantity || ""}
                          onChange={(event) =>
                            setQuantity(Number(event.target.value))
                          }
                        />
                      </Field>
                      <Field
                        label="Unit Purchase Price (৳)"
                        className="purchase-price-field"
                      >
                        <input
                          aria-label="Unit purchase price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={unitPrice}
                          onChange={(event) => setUnitPrice(event.target.value)}
                          placeholder="0.00"
                        />
                      </Field>
                      <Field label="Total (৳)" className="purchase-line-total">
                        <input
                          readOnly
                          value={money(
                            decimalAmount(
                              cents(unitPrice) *
                                BigInt(
                                  Number.isInteger(quantity) && quantity > 0
                                    ? quantity
                                    : 0,
                                ),
                            ),
                          )}
                        />
                      </Field>
                      <Button
                        type="button"
                        onClick={addItem}
                        disabled={options.loading || !product}
                      >
                        <Plus />
                        Add to List
                      </Button>
                    </div>
                    <div className="purchase-identities-slot">
                      {individual && quantity >= 1 && quantity <= 500 ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="purchase-identities"
                          onClick={() => setIdentityOpen(true)}
                        >
                          Battery Identification · {identityCount}/{quantity}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Panel>
                <Panel title="Purchase Items" className="purchase-items">
                  <div className="purchase-cart-body">
                    <div className="erp-table-wrap">
                      <table className="erp-table">
                        <caption className="sr-only">Purchase items</caption>
                        <colgroup>
                          {[32, 17, 8, 17, 18, 8].map((width, index) => (
                            <col key={index} style={{ width: `${width}%` }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            {[
                              "Product",
                              "Type",
                              "Qty",
                              "Unit Price",
                              "Total",
                              "Action",
                            ].map((label) => (
                              <th key={label}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cartRows.map((item) => (
                            <tr key={item.productId}>
                              <td>
                                <span
                                  className="line-clamp-2"
                                  title={item.name}
                                >
                                  {item.name}
                                </span>
                                {item.identities?.length ? (
                                  <small className="mt-1 block text-slate-500">
                                    {item.identities.length} battery identities
                                  </small>
                                ) : null}
                              </td>
                              <td>
                                <span
                                  className="line-clamp-2"
                                  title={item.typeName}
                                >
                                  {item.typeName}
                                </span>
                              </td>
                              <td>{item.quantity}</td>
                              <td>{money(item.unitPrice)}</td>
                              <td>
                                {money(
                                  decimalAmount(
                                    cents(item.unitPrice) *
                                      BigInt(item.quantity),
                                  ),
                                )}
                              </td>
                              <td>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Remove ${item.name}`}
                                  onClick={() =>
                                    setCart(
                                      cart.filter(
                                        (row) =>
                                          row.productId !== item.productId,
                                      ),
                                    )
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!cart.length ? (
                      <div
                        className="erp-empty purchase-cart-empty"
                        role="status"
                      >
                        <PackageOpen size={26} strokeWidth={1.3} />
                        <p>কোনো পণ্য যোগ করা হয়নি</p>
                        <span>
                          পণ্য, quantity ও purchase price দিয়ে Add to List চাপুন।
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div
                    className="purchase-cart-pager"
                    data-visible={cartPages > 1}
                    aria-hidden={cartPages <= 1}
                    inert={cartPages <= 1}
                  >
                    <span>
                      {cart.length ? cartIndex * cartPageSize + 1 : 0}–
                      {Math.min((cartIndex + 1) * cartPageSize, cart.length)} /{" "}
                      {cart.length} items
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Previous cart page"
                        disabled={cartIndex === 0}
                        onClick={() => setCartPage(cartIndex - 1)}
                      >
                        <ChevronLeft />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Next cart page"
                        disabled={cartIndex >= cartPages - 1}
                        onClick={() => setCartPage(cartIndex + 1)}
                      >
                        <ChevronRight />
                      </Button>
                    </div>
                  </div>
                </Panel>
              </div>
              <aside className="erp-form-side">
                <Panel>
                  <h2 className="erp-summary-title">
                    <ShoppingCart size={24} />
                    Purchase Summary
                  </h2>
                  <SummaryRows
                    rows={[
                      ["Total Items", String(cart.length)],
                      [
                        "Total Quantity",
                        String(
                          cart.reduce((sum, item) => sum + item.quantity, 0),
                        ),
                      ],
                      ["Subtotal", money(total)],
                      ["Paid", money(paid)],
                      ["Due", money(due)],
                    ]}
                  />
                  <div className="erp-summary-total">
                    <span>Grand Total</span>
                    <span>{money(total)}</span>
                  </div>
                </Panel>
                <Panel title="Payment Information" icon={CreditCard}>
                  <div className="erp-form-body">
                    <Field label="Payment Type">
                      <select
                        aria-label="Payment Type"
                        value={paymentType}
                        onChange={(event) => setPaymentType(event.target.value)}
                      >
                        <option value="due">Due</option>
                        {canPay ? (
                          <>
                            <option value="full">Full Payment</option>
                            <option value="partial">Partial Payment</option>
                          </>
                        ) : null}
                      </select>
                    </Field>
                    <div
                      className="purchase-payment-area"
                      data-payment-type={paymentType}
                    >
                      <fieldset
                        className="purchase-payment-fields grid gap-4"
                        disabled={paymentType === "due"}
                        aria-hidden={paymentType === "due"}
                        inert={paymentType === "due"}
                      >
                        <Field label="Paid Amount (৳)" required>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paid}
                            readOnly={paymentType === "full"}
                            onChange={(event) =>
                              setPartialPaid(event.target.value)
                            }
                            required
                          />
                        </Field>
                        <Field label="Payment Method" required>
                          <select
                            value={
                              paymentAccountId ||
                              options.data?.paymentAccounts[0]?.id ||
                              ""
                            }
                            onChange={(event) =>
                              setPaymentAccountId(event.target.value)
                            }
                            required
                          >
                            {options.data?.paymentAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </fieldset>
                      {paymentType === "due" ? (
                        <p className="purchase-payment-hint">
                          ক্রয়মূল্য সাপ্লায়ারের বকেয়ায় যুক্ত হবে।
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Panel>
                <Panel
                  title="Notes (Optional)"
                  icon={ClipboardList}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      title={notes || undefined}
                      onClick={() => setNotesOpen(true)}
                    >
                      {notes ? "Edit Note" : "Add Note"}
                    </Button>
                  }
                >
                  <span className="sr-only">{notes || "No note added"}</span>
                </Panel>
              </aside>
            </div>
          </fieldset>
          {preview ? (
            <p className="mt-4 text-xs text-amber-700">
              UI preview: লগইন ছাড়া Purchase সেভ হবে না।
            </p>
          ) : null}
          <div className="erp-form-actions">
            <p className="text-xs text-slate-500">
              কনফার্ম করলেই পণ্য স্টকে যুক্ত হবে।
            </p>
            <Button
              type="submit"
              className="erp-button"
              disabled={
                saving ||
                loading ||
                preview ||
                !canReceive ||
                !cart.length ||
                options.loading
              }
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {saving ? "Receiving..." : "Receive & Confirm"}
            </Button>
          </div>
        </form>
      )}
      <Dialog.Root open={notesOpen} onOpenChange={setNotesOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
          <Dialog.Content className="feature-dialog">
            <Dialog.Title className="text-xl font-bold">
              Purchase Notes
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-slate-500">
              ক্রয়ের সঙ্গে প্রয়োজনীয় নোট সংরক্ষণ করুন।
            </Dialog.Description>
            <div className="mt-5">
              <Field label="Notes">
                <textarea
                  aria-label="Purchase notes"
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <Dialog.Close asChild>
                <Button type="button">Done</Button>
              </Dialog.Close>
            </div>
            <Dialog.Close
              aria-label="Close purchase notes"
              className="absolute top-4 right-4"
            >
              <X size={19} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={identityOpen} onOpenChange={setIdentityOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
          <Dialog.Content className="feature-dialog">
            <Dialog.Title className="text-xl font-bold">
              Battery Identification
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-slate-500">
              {product?.name} · Battery {unitIndex + 1} / {quantity} · Completed{" "}
              {identityCount}
            </Dialog.Description>
            <div className="mt-5 grid gap-4">
              {product?.identificationMethod !== "PRODUCTION_DATE" ? (
                <Field label="Serial Number">
                  <input
                    aria-label={`Battery ${unitIndex + 1} serial number`}
                    value={identities[unitIndex]?.serialNumber ?? ""}
                    maxLength={160}
                    onChange={(event) =>
                      identity(unitIndex, "serialNumber", event.target.value)
                    }
                  />
                </Field>
              ) : null}
              {product?.identificationMethod !== "SERIAL" ? (
                <Field label="Production Date">
                  <input
                    aria-label={`Battery ${unitIndex + 1} production date`}
                    type="date"
                    max={purchaseDate}
                    value={identities[unitIndex]?.productionDate ?? ""}
                    onChange={(event) =>
                      identity(unitIndex, "productionDate", event.target.value)
                    }
                  />
                </Field>
              ) : null}
            </div>
            <div className="mt-5 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Previous battery"
                disabled={unitIndex === 0}
                onClick={() => setIdentityPage(unitIndex - 1)}
              >
                <ChevronLeft />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Next battery"
                disabled={unitIndex >= quantity - 1}
                onClick={() => setIdentityPage(unitIndex + 1)}
              >
                Next
                <ChevronRight />
              </Button>
              <Dialog.Close asChild>
                <Button type="button" size="sm">
                  Done
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Close
              aria-label="Close battery identification"
              className="absolute top-4 right-4"
            >
              <X size={19} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={newProductOpen} onOpenChange={setNewProductOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
          <Dialog.Content className="feature-dialog catalog-product-dialog">
            <Dialog.Title className="text-xl font-bold">
              New Purchase Product
            </Dialog.Title>
            <Dialog.Description className="mt-2 mb-5 text-xs leading-6 text-slate-500">
              নতুন পণ্যের তথ্য দিন। এরপর quantity ও purchase price দিয়ে ক্রয় কনফার্ম
              করুন।
            </Dialog.Description>
            {catalog.loading ? (
              <p role="status" className="py-8 text-center text-sm">
                Loading product categories...
              </p>
            ) : catalog.error ? (
              <div
                role="alert"
                className="rounded-lg bg-red-50 p-4 text-sm text-red-700"
              >
                {catalog.error}
                <Button
                  className="mt-3"
                  type="button"
                  variant="outline"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <ProductForm
                metadata={catalog.data}
                typeId={newProductTypeId}
                onTypeChange={setNewProductTypeId}
                onSaved={productSaved}
                preview={preview}
              />
            )}
            <Dialog.Close
              aria-label="Close purchase product dialog"
              className="absolute top-4 right-4 rounded p-1 text-slate-400"
            >
              <X size={19} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
