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
  type CatalogProduct,
} from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { cents, decimalAmount } from "@/lib/purchase-amounts";
import { money } from "@/lib/utils";

type CartItem = {
  productId: string;
  name: string;
  typeName: string;
  model: string;
  quantity: number;
  unitPrice: string;
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
  const [notesOpen, setNotesOpen] = useState(false);
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
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [productName, setProductName] = useState("");
  const [model, setModel] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [capacityAh, setCapacityAh] = useState("");
  const [adding, setAdding] = useState(false);
  const [createdProducts, setCreatedProducts] = useState<CatalogProduct[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState("due");
  const [partialPaid, setPartialPaid] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [received, setReceived] = useState<ReceivedPurchase | null>(null);
  const requestKey = useRef<string | null>(null);
  const types = options.data?.types ?? [];
  const filteredProducts = [
    ...(options.data?.products ?? []),
    ...createdProducts,
  ].filter(
    (item, index, items) =>
      item.type.id === productTypeId &&
      items.findIndex((candidate) => candidate.id === item.id) === index,
  );
  const product = filteredProducts.find(
    (item) =>
      item.name === productName &&
      item.model.toLowerCase() === model.trim().toLowerCase(),
  );
  const filteredSuppliers = (options.data?.suppliers ?? []).filter(
    (supplier) => supplier.productTypeId === productTypeId,
  );
  const selectedSupplierId = filteredSuppliers.some(
    (supplier) => supplier.id === supplierId,
  )
    ? supplierId
    : "";
  const productNames = (options.data?.productNames ?? []).filter(
    (item) => item.typeId === productTypeId,
  );
  const productChoices = [
    ...filteredProducts.map((item) => ({ value: item.id, name: item.name })),
    ...productNames.map((item) => ({
      value: `name:${item.id}`,
      name: item.name,
    })),
  ].filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.name === item.name) === index,
  );
  const hasProductOptions = productChoices.length > 0;
  const selectedType = types.find((item) => item.id === productTypeId);
  const individual = selectedType?.trackingKind === "BATTERY_UNIT";
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
  function selectProductName(name: string) {
    setProductName(name);
    setModel("");
    setWarrantyMonths("");
    setCapacityAh("");
  }
  async function addItem() {
    if (adding || preview) return;
    setError("");
    if (
      !selectedType ||
      !productName ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > (individual ? 500 : 10000) ||
      !/^\d{1,14}(?:\.\d{1,2})?$/.test(unitPrice)
    ) {
      setError(
        "Select a product and enter a valid quantity and purchase price.",
      );
      return;
    }
    if (
      (individual &&
        (!model.trim() ||
          !/^\d{1,8}(?:\.\d{1,2})?$/.test(capacityAh) ||
          Number(capacityAh) <= 0)) ||
      !/^\d+$/.test(warrantyMonths || "0") ||
      Number(warrantyMonths) > 600
    ) {
      setError(
        "Enter the warranty (0-600 months), and required battery model and capacity.",
      );
      return;
    }
    setAdding(true);
    try {
      let selected = product;
      if (!selected) {
        if (!canDefineProduct)
          throw new Error(
            "You do not have permission to add a new product model.",
          );
        const created = await post<CatalogProduct>("/products", {
          typeId: productTypeId,
          name: productName,
          category: productName,
          model: model.trim(),
          unit: "pcs",
          warrantyMonths: Number(warrantyMonths),
          ...(individual ? { capacityAh } : {}),
        });
        setCreatedProducts((items) => [...items, created]);
        selected = created;
      }
      if (cart.some((item) => item.productId === selected.id))
        throw new Error(
          "This product model is already in the purchase list. Remove its line to change the quantity.",
        );
      setCartPage(Math.floor(cart.length / cartPageSize));
      setCart((items) => [
        ...items,
        {
          productId: selected.id,
          name: selected.name,
          model: selected.model,
          typeName: selected.type.name,
          quantity,
          unitPrice,
        },
      ]);
      selectProductName("");
      setQuantity(1);
      setUnitPrice("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not add this product.",
      );
    } finally {
      setAdding(false);
    }
  }
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || saving) return;
    setError("");
    setReceived(null);
    if (!selectedSupplierId || !cart.length) {
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
          supplierId: selectedSupplierId,
          purchaseDate,
          reference,
          notes,
          items: cart.map(({ productId, quantity, unitPrice }) => ({
            productId,
            quantity,
            unitPrice,
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
        <form onSubmit={receive} autoComplete="off">
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
            disabled={saving || adding || loading || options.loading}
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
                    !loading &&
                    productTypeId &&
                    filteredSuppliers.length === 0 ? (
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
                    <div className="purchase-product-heading mt-5 mb-3 flex items-center justify-between gap-3">
                      <h3 className="erp-section-title mb-0!">Add Products</h3>
                    </div>
                    <div className="erp-add-products">
                      <Field
                        label="Product Category"
                        className="purchase-type-field"
                      >
                        <select
                          aria-label="Purchase product type"
                          value={productTypeId}
                          disabled={!types.length || cart.length > 0}
                          onChange={(event) => {
                            setProductTypeId(event.target.value);
                            setSupplierId("");
                            selectProductName("");
                            setQuantity(1);
                            setUnitPrice("");

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
                      <Field
                        label="Supplier"
                        required
                        className="purchase-supplier-field"
                      >
                        <select
                          aria-label="Purchase supplier"
                          value={selectedSupplierId}
                          onChange={(event) =>
                            setSupplierId(event.target.value)
                          }
                          required
                        >
                          <option value="">
                            {!productTypeId
                              ? "আগে Product Category নির্বাচন করুন"
                              : filteredSuppliers.length
                                ? "সাপ্লায়ার নির্বাচন করুন"
                                : "এই ক্যাটাগরিতে সাপ্লায়ার নেই"}
                          </option>
                          {filteredSuppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                              {supplier.company ? " · " + supplier.company : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Product" className="purchase-product-field">
                        <select
                          aria-label="Purchase product"
                          value={productName}
                          disabled={!productTypeId || !hasProductOptions}
                          onChange={(event) =>
                            selectProductName(event.target.value)
                          }
                        >
                          <option value="">
                            {!productTypeId
                              ? "আগে পণ্যের ধরন নির্বাচন করুন"
                              : !hasProductOptions
                                ? "এই ধরনে কোনো পণ্য নেই"
                                : "পণ্য নির্বাচন করুন"}
                          </option>
                          {productChoices.map((item) => (
                            <option key={item.value} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        label="Model"
                        required={individual}
                        className="purchase-model-field"
                      >
                        <input
                          aria-label="Purchase product model"
                          value={model}
                          maxLength={160}
                          disabled={!productName}
                          onChange={(event) => setModel(event.target.value)}
                        />
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
                    </div>
                    <div className="purchase-basics purchase-product-fields grid">
                      <Field label="Warranty (months)">
                        <input
                          aria-label="Purchase product warranty"
                          type="number"
                          min="0"
                          max="600"
                          step="1"
                          value={warrantyMonths}
                          disabled={!productName}
                          onFocus={(event) => {
                            if (event.currentTarget.value === "0")
                              event.currentTarget.select();
                          }}
                          onChange={(event) =>
                            setWarrantyMonths(
                              event.target.value.replace(/^0+(?=\d)/, ""),
                            )
                          }
                        />
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
                      <div className="purchase-capacity-field">
                        {individual ? (
                          <Field label="Capacity (Ah)" required>
                            <input
                              aria-label="Purchase product capacity"
                              type="number"
                              min="0.01"
                              max="99999999.99"
                              step="0.01"
                              disabled={!productName}
                              value={capacityAh}
                              onChange={(event) =>
                                setCapacityAh(event.target.value)
                              }
                            />
                          </Field>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        className="purchase-add-button"
                        onClick={addItem}
                        disabled={options.loading || adding || !productName}
                      >
                        <Plus />
                        {adding ? "Adding..." : "Add to List"}
                      </Button>
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
                                {item.model ? (
                                  <small className="block text-slate-500">
                                    {item.model}
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
    </div>
  );
}
