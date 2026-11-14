"use client";
import { useDeferredValue, useState } from "react";
import { AlertDialog, Dialog } from "radix-ui";
import {
  BatteryCharging,
  Box,
  ChevronLeft,
  ChevronRight,
  Cog,
  Filter,
  Package,
  Truck,
  TriangleAlert,
  Search,
  X,
} from "lucide-react";
import { EmptyTable, Panel, StatCard } from "@/components/reference-ui";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { cn, money } from "@/lib/utils";
import {
  type CatalogMetadata,
  type ProductList,
  type DashboardData,
  api,
  csrf,
} from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { ProductNameForm } from "./catalog-forms";
import { CatalogActions } from "./catalog-actions";

type DeleteTarget = {
  kind: "name";
  id: string;
  name: string;
  typeId: string;
  categoryName: string;
};

const columns = [
  "#",
  "পণ্যের নাম (Product)",
  "ধরন",
  "মডেল / স্পেসিফিকেশন",
  "ইউনিট",
  "মোট স্টক",
  "বিক্রয়যোগ্য",
  "বিক্রয় মূল্য",
  "ওয়ারেন্টি",
  "স্ট্যাটাস",
];

function EasyBikeIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Canopy, curved windscreen, and open passenger cabin. */}
      <path d="M9 5h19l2 3H11L9 5Z" />
      <path d="M11 8 6 11 3 19h8V8m17 0v12M17 8v12" />
      <path d="M20 11v5h8m-8 0v4h8" />
      {/* Driver's handlebar, body, and passenger step. */}
      <path d="m9 15 5 1 1 4h14v4h-1m-6 0H12l-2-5H3v4h2" />
      <path d="M14 20h5m-5 7h7M7 20l1 4" />
      {/* Front and rear wheels distinguish the three-wheeler silhouette. */}
      <circle cx="8" cy="26" r="3" />
      <circle cx="25" cy="25" r="3" />
      <path d="M4 17h2" />
    </svg>
  );
}

export function CatalogView({
  preview = false,
  data = null,
}: {
  preview?: boolean;
  data?: DashboardData | null;
}) {
  const user = useSession();
  const [typeId, setTypeId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [revision, setRevision] = useState(0);
  const [productNameOpen, setProductNameOpen] = useState(false);
  const [nameFormTypeId, setNameFormTypeId] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [message, setMessage] = useState("");
  const canWrite =
    preview || Boolean(user?.permissions.includes("catalog.write"));
  const metadataParams = new URLSearchParams({ status });
  if (typeId) metadataParams.set("typeId", typeId);
  const params = new URLSearchParams({
    status,
    page: String(page),
    pageSize: String(pageSize),
  });
  if (typeId) params.set("typeId", typeId);
  if (categoryId) params.set("categoryId", categoryId);
  if (deferredSearch.trim()) params.set("q", deferredSearch.trim());
  const metadata = useCatalogResource<CatalogMetadata>(
    preview ? null : "/catalog?" + metadataParams,
    revision,
  );
  const products = useCatalogResource<ProductList>(
    preview ? null : "/products?" + params,
    revision,
  );
  const selectedType = metadata.data?.types.find((item) => item.id === typeId);
  const selectedName = metadata.data?.categories.find(
    (item) => item.id === categoryId && item.typeIds?.includes(typeId),
  );
  const nameGroups = (metadata.data?.types ?? [])
    .filter((type) => !typeId || type.id === typeId)
    .map((type) => ({
      type,
      names: (metadata.data?.categories ?? []).filter((name) =>
        name.typeIds?.includes(type.id),
      ),
    }));
  function selectType(id: string) {
    setTypeId(id);
    setCategoryId("");
    setPage(1);
  }
  async function deleteSelection() {
    if (!deleteTarget || deleting || preview) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/categories/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": await csrf() },
        body: JSON.stringify({
          confirmed: true,
          typeId: deleteTarget.typeId,
        }),
      });
      setMessage(`Product Name “${deleteTarget.name}” মুছে ফেলা হয়েছে।`);
      setDeleteOpen(false);
      if (categoryId === deleteTarget.id && typeId === deleteTarget.typeId) {
        setCategoryId("");
        setPage(1);
      }
      setRevision((value) => value + 1);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "মুছে ফেলা যায়নি।",
      );
    } finally {
      setDeleting(false);
    }
  }
  const error = metadata.error || products.error;
  const pages = Math.max(1, Math.ceil((products.data?.total ?? 0) / pageSize));
  return (
    <>
      <div className="erp-page-title">
        <div>
          <span className="title-icon">
            <Box size={39} strokeWidth={1.8} />
          </span>
          <div>
            <h2>Inventory / Stock</h2>
            <p>ক্যাটাগরি, পণ্যের নাম ও স্টক দেখুন। Purchase থেকে স্টক যোগ করুন।</p>
          </div>
        </div>
      </div>
      <div className="erp-stats inventory-stats">
        <StatCard
          label="মোট স্টক"
          value={preview ? "—" : (data?.stock?.accountedUnits ?? "—")}
          icon={Package}
        />
        <StatCard
          label="বিক্রয়যোগ্য স্টক"
          value={preview ? "—" : (data?.counts.availableStock ?? "—")}
          icon={Box}
        />
        <StatCard
          label="রিপ্লেসেবল"
          value={preview ? "—" : String(data?.stock?.replaceable ?? "—")}
          icon={TriangleAlert}
          tone="orange"
        />
        <StatCard
          label="কোম্পানিতে পাঠানো"
          value={preview ? "—" : String(data?.counts.sentToCompany ?? "—")}
          icon={Truck}
          tone="blue"
        />
        <StatCard
          label="রিজার্ভ"
          value={preview ? "—" : String(data?.stock?.reserved ?? "—")}
          icon={Package}
          tone="purple"
        />
        <StatCard
          label="কম স্টক পণ্য"
          value={preview ? "—" : String(data?.counts.lowStock ?? "—")}
          icon={TriangleAlert}
          tone="red"
        />
      </div>
      {message ? (
        <p
          role="status"
          className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <div className="products-layout">
        <aside
          className="erp-panel erp-filter-panel"
          aria-label="Product filters"
        >
          <section className="filter-section">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="mb-0!">Product Category</h3>
            </div>
            <button
              className={cn("filter-option", !typeId && "active")}
              aria-pressed={!typeId}
              onClick={() => selectType("")}
            >
              <Package size={20} />
              <span>All Products</span>
              <span>{metadata.data?.totalProducts ?? "—"}</span>
            </button>
            {metadata.data?.types.map((type) => (
              <button
                key={type.id}
                className={cn("filter-option", typeId === type.id && "active")}
                aria-pressed={typeId === type.id}
                onClick={() => selectType(type.id)}
              >
                {type.trackingKind === "BATTERY_UNIT" ? (
                  <BatteryCharging size={20} aria-hidden="true" />
                ) : type.name === "Easy Bike & Rickshaw" ? (
                  <EasyBikeIcon />
                ) : (
                  <Cog size={20} aria-hidden="true" />
                )}
                <span className="min-w-0 break-words">{type.name}</span>
                <span>{type.productCount}</span>
              </button>
            ))}
            {!metadata.loading && !metadata.data?.types.length ? (
              <p className="px-2 py-3 text-xs leading-6 text-slate-500">
                কোনো Product Category নেই। তিন ডট থেকে নতুন ক্যাটাগরি যোগ করুন।
              </p>
            ) : null}
          </section>
          <section className="filter-section" aria-label="Product Name groups">
            {nameGroups.map(({ type, names }) => (
              <div
                key={type.id}
                role="group"
                aria-label={type.name}
                className="product-name-group"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="mb-0!">{type.name}</h3>
                  {canWrite ? (
                    <CatalogActions
                      label={`${type.name} product actions`}
                      addLabel="Add Product Name"
                      deleteLabel="Delete Product Name"
                      canDelete={Boolean(
                        selectedName && selectedType?.id === type.id,
                      )}
                      onAdd={() => {
                        setNameFormTypeId(type.id);
                        setProductNameOpen(true);
                      }}
                      onDelete={() => {
                        if (!selectedName || selectedType?.id !== type.id)
                          return;
                        setDeleteTarget({
                          kind: "name",
                          id: selectedName.id,
                          name: selectedName.name,
                          typeId: type.id,
                          categoryName: type.name,
                        });
                        setDeleteError("");
                        setDeleteOpen(true);
                      }}
                    />
                  ) : null}
                </div>
                {names.length ? (
                  names.map((name) => (
                    <button
                      key={name.id}
                      className={cn(
                        "filter-option",
                        categoryId === name.id &&
                          typeId === type.id &&
                          "active",
                      )}
                      aria-pressed={
                        categoryId === name.id && typeId === type.id
                      }
                      onClick={() => {
                        setCategoryId(
                          typeId === type.id && categoryId === name.id
                            ? ""
                            : name.id,
                        );
                        setTypeId(type.id);
                        setPage(1);
                      }}
                    >
                      <Package size={18} />
                      <span className="min-w-0 break-words">{name.name}</span>
                      <span>{name.productCountsByType?.[type.id] ?? 0}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-2 text-xs leading-6 text-slate-400">
                    এই ক্যাটাগরিতে এখনো পণ্যের নাম যোগ করা হয়নি।
                  </p>
                )}
              </div>
            ))}
          </section>
        </aside>
        <Panel>
          <div className="erp-filterbar">
            <label className="erp-search">
              <Search size={18} />
              <input
                aria-label="Search products"
                placeholder="পণ্যের নাম বা মডেল সার্চ করুন..."
                value={search}
                maxLength={160}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <select
              className="erp-select"
              aria-label="Product category"
              value={typeId}
              onChange={(event) => selectType(event.target.value)}
            >
              <option value="">প্রোডাক্ট ক্যাটাগরি: সব</option>
              {metadata.data?.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            <select
              className="erp-select"
              aria-label="Product status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="active">স্ট্যাটাস: সক্রিয়</option>
              <option value="inactive">নিষ্ক্রিয়</option>
              <option value="all">সকল স্ট্যাটাস</option>
            </select>
            <Button
              variant="outline"
              className="erp-button"
              onClick={() => {
                selectType("");
                setSearch("");
                setStatus("active");
              }}
            >
              <Filter />
              ফিল্টার রিসেট
            </Button>
          </div>
          {products.loading ? (
            <p role="status" className="p-8 text-center text-sm text-slate-500">
              Loading products...
            </p>
          ) : products.data?.items.length ? (
            <div className="erp-table-wrap">
              <table className="erp-table">
                <caption className="sr-only">Products</caption>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.data.items.map((product, index) => (
                    <tr key={product.id}>
                      <td>{(page - 1) * pageSize + index + 1}</td>
                      <td>
                        <strong>{product.name}</strong>
                        <small className="mt-1 block max-w-48 break-all text-[10px] text-slate-400">
                          {product.sku}
                        </small>
                      </td>
                      <td>{product.type.name}</td>
                      <td>
                        {[
                          product.model,
                          product.capacityAh ? `${product.capacityAh} Ah` : "",
                          product.voltage ? `${product.voltage} V` : "",
                          product.specifications,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td>{product.unit}</td>
                      <td>{product.stock.total}</td>
                      <td>{product.stock.available}</td>
                      <td className="whitespace-nowrap">
                        {money(product.defaultSellingPrice)}
                      </td>
                      <td>{product.warrantyMonths} মাস</td>
                      <td>{product.active ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyTable
              title={search ? "No matching records" : "No records to display"}
              description="এই ফিল্টারে পণ্য নেই। Purchase থেকে পণ্য কিনে স্টক যোগ করুন।"
              columns={columns}
            />
          )}
          <div className="erp-pager">
            <label>
              প্রতি পাতায় দেখান:
              <select
                aria-label="Products per page"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {products.data?.total ?? 0} products · {page} / {pages}
            </span>
            <div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous product page"
                disabled={page <= 1 || products.loading}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next product page"
                disabled={page >= pages || products.loading}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Panel>
      </div>
      <AlertDialog.Root
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-90 bg-slate-950/40" />
          <AlertDialog.Content className="feature-dialog z-100!">
            <AlertDialog.Title className="text-lg font-bold">
              Delete Product Name
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-3 text-sm leading-7 text-slate-600">
              {`?${deleteTarget?.name ?? ""}? ????? ?${deleteTarget?.categoryName ?? ""}? ????????? ???? ???? ??????? ?? ???? ???? ????? ????? ?????? ???`}
            </AlertDialog.Description>
            {deleteError ? (
              <p role="alert" className="mt-3 text-xs text-red-600">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <Button variant="outline" disabled={deleting}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  disabled={deleting || preview}
                  onClick={(event) => {
                    event.preventDefault();
                    void deleteSelection();
                  }}
                >
                  {deleting ? "Deleting..." : "Confirm Delete"}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <Dialog.Root open={productNameOpen} onOpenChange={setProductNameOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-70 bg-slate-950/40" />
          <Dialog.Content className="feature-dialog catalog-type-dialog">
            <Dialog.Title className="text-xl font-bold">
              Add Product Name
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-slate-500">
              নির্বাচিত Product Category-এর অধীনে পণ্যের নাম যোগ করুন।
            </Dialog.Description>
            <ProductNameForm
              metadata={metadata.data}
              typeId={nameFormTypeId}
              preview={preview}
              onSaved={(id) => {
                setProductNameOpen(false);
                if (typeId) selectType(id);
                setRevision((value) => value + 1);
                setMessage("পণ্যের নাম যোগ হয়েছে।");
              }}
            />
            <Dialog.Close
              aria-label="Close product name dialog"
              className="absolute top-4 right-4"
            >
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
