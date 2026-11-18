"use client";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/reference-ui";
import type { SalesOptions } from "@/lib/api";
import { cents, decimalAmount } from "@/lib/purchase-amounts";

export type SaleEntry = {
  id: string;
  typeId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
};
export function blankSaleEntry(id: string): SaleEntry {
  return { id, typeId: "", productId: "", quantity: "0", unitPrice: "" };
}
export function SaleProductEntry({
  entry,
  index,
  options,
  removable,
  onChange,
  onRemove,
}: {
  entry: SaleEntry;
  index: number;
  options: SalesOptions | null;
  removable: boolean;
  onChange: (patch: Partial<SaleEntry>) => void;
  onRemove: () => void;
}) {
  const products =
    options?.products.filter((product) => product.type.id === entry.typeId) ??
    [];
  const product = products.find((product) => product.id === entry.productId);
  const count = /^\d+$/.test(entry.quantity) ? Number(entry.quantity) : 0;
  const total =
    Number.isSafeInteger(count) && count > 0 && count <= 10000
      ? decimalAmount(cents(entry.unitPrice) * BigInt(count))
      : "0.00";
  return (
    <div
      className="sales-product-entry"
      role="group"
      aria-label={`Product ${index + 1}`}
    >
      {removable ? (
        <div className="sales-entry-heading">
          <span>Product {index + 1}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove product ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      ) : null}
      <div className="sales-product-fields">
        <Field label="Product Category" className="sales-type-field" required>
          <select
            aria-label="Sales product category"
            required
            value={entry.typeId}
            disabled={!options?.types.length}
            onChange={(event) =>
              onChange({
                typeId: event.target.value,
                productId: "",
                quantity: "0",
                unitPrice: "",
              })
            }
          >
            <option value="">ক্যাটাগরি নির্বাচন করুন</option>
            {options?.types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product" className="sales-product-field" required>
          <select
            aria-label="Sales product"
            required
            value={entry.productId}
            disabled={!entry.typeId || !products.length}
            onChange={(event) => {
              const selected = products.find(
                (product) => product.id === event.target.value,
              );
              onChange({
                productId: event.target.value,
                quantity: "0",
                unitPrice:
                  selected && cents(selected.defaultSellingPrice) > BigInt(0)
                    ? selected.defaultSellingPrice
                    : "",
              });
            }}
          >
            <option value="">
              {!entry.typeId
                ? "আগে ক্যাটাগরি নির্বাচন করুন"
                : !products.length
                  ? "এই ক্যাটাগরিতে কোনো পণ্য নেই"
                  : "পণ্য নির্বাচন করুন"}
            </option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
                {product.model ? " · " + product.model : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Qty" className="sales-qty-field" required>
          <input
            aria-label="Sales quantity"
            type="number"
            min="1"
            required
            max="10000"
            step="1"
            value={entry.quantity}
            placeholder="0"
            onFocus={() => {
              if (entry.quantity === "0") onChange({ quantity: "" });
            }}
            onBlur={() => {
              if (!entry.quantity) onChange({ quantity: "0" });
            }}
            onChange={(event) =>
              onChange({
                quantity: event.target.value.replace(/^0+(?=\d)/, ""),
              })
            }
          />
        </Field>
        <Field label="Unit Price (৳)" className="sales-price-field" required>
          <input
            aria-label="Unit sale price"
            type="number"
            min="0.01"
            required
            step="0.01"
            placeholder="0.00"
            value={entry.unitPrice}
            onFocus={() => {
              if (/^0(?:\.0*)?$/.test(entry.unitPrice))
                onChange({ unitPrice: "" });
            }}
            onChange={(event) =>
              onChange({
                unitPrice: event.target.value.replace(/^0+(?=\d)/, ""),
              })
            }
          />
        </Field>
        <Field label="Total (৳)" className="sales-total-field">
          <input aria-label="Sales line total" readOnly value={total} />
        </Field>
      </div>
      <p className="sales-stock-hint">
        {product
          ? `বিক্রয়যোগ্য স্টক: ${product.availableQuantity} ${product.unit}`
          : "ক্যাটাগরি ও পণ্য বাছাই করে quantity এবং unit price দিন।"}
      </p>
    </div>
  );
}
