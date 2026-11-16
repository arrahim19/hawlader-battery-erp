"use client";

import { useRef, useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/reference-ui";
import { businessDate, money } from "@/lib/utils";
import { cents, decimalAmount } from "@/lib/purchase-amounts";
import { post, type PurchaseOptions, type RecentPurchases } from "@/lib/api";

export function PurchaseQuickAdd({
  kind,
  type,
  onClose,
  onProductSaved,
  onSupplierSaved,
}: {
  kind: "product" | "supplier";
  type: { id: string; name: string };
  onClose: () => void;
  onProductSaved: (product: {
    id: string;
    name: string;
    typeId: string;
  }) => void;
  onSupplierSaved: (supplier: PurchaseOptions["suppliers"][number]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const supplier = kind === "supplier";
  const title = supplier ? "Add Supplier" : "Add Product";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    if (!text("name")) {
      setError("Enter a name.");
      return;
    }
    if (supplier && !/^[+0-9][0-9 ()-]{5,29}$/.test(text("phone"))) {
      setError("Enter a valid mobile number.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      if (supplier) {
        const created = await post<PurchaseOptions["suppliers"][number]>(
          "/suppliers",
          {
            productTypeId: type.id,
            name: text("name"),
            phone: text("phone"),
            company: text("company"),
            address: text("address"),
          },
        );
        onSupplierSaved(created);
      } else {
        const created = await post<{ id: string; name: string }>(
          "/categories",
          {
            typeId: type.id,
            name: text("name"),
          },
        );
        onProductSaved({ ...created, typeId: type.id });
      }
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Please retry.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-70 bg-slate-950/40" />
        <Dialog.Content
          className="feature-dialog"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (submitting.current) event.preventDefault();
          }}
        >
          <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-slate-500">
            {type.name}
          </Dialog.Description>
          <form onSubmit={save} className="mt-4 grid gap-3" autoComplete="off">
            <fieldset disabled={saving} className="grid gap-3">
              <Field
                label={supplier ? "Supplier Name" : "Product Name"}
                required
              >
                <input name="name" required maxLength={160} />
              </Field>
              {supplier ? (
                <>
                  <Field label="Mobile Number" required>
                    <input name="phone" type="tel" required maxLength={30} />
                  </Field>
                  <Field label="Company / Brand">
                    <input name="company" maxLength={160} />
                  </Field>
                  <Field label="Address">
                    <textarea name="address" maxLength={500} rows={2} />
                  </Field>
                </>
              ) : null}
            </fieldset>
            {error ? (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2"
            aria-label={`Close ${title}`}
            disabled={saving}
            onClick={onClose}
          >
            <X />
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PurchaseDetailsButton({
  purchase,
}: {
  purchase: RecentPurchases["items"][number];
}) {
  const total = decimalAmount(
    purchase.items.reduce((sum, item) => sum + cents(item.total), BigInt(0)),
  );
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="purchase-details-button"
        >
          View Details
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
        <Dialog.Content className="feature-dialog customer-history-dialog">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-bold">
                Purchase Details
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                {purchase.supplier.company || purchase.supplier.name} · Challan
                No.: {purchase.supplierReference || "—"} ·{" "}
                {businessDate(purchase.purchaseDate)}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close purchase details"
              className="absolute top-3 right-3"
            >
              <X />
            </Dialog.Close>
          </header>
          <div className="min-h-0 overflow-auto p-4">
            <table className="erp-table min-w-[600px]">
              <caption className="sr-only">
                Products purchased on challan{" "}
                {purchase.supplierReference || purchase.number}
              </caption>
              <thead>
                <tr>
                  {["Product", "Model", "Qty", "Unit Price", "Amount"].map(
                    (label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item) => (
                  <tr key={item.id}>
                    {[
                      item.name,
                      item.model.trim() || "—",
                      item.quantity,
                      money(item.unitPrice),
                      money(item.total),
                    ].map((value, index) => (
                      <td key={index}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={4} style={{ textAlign: "right" }}>
                    Total
                  </th>
                  <td className="font-bold">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
