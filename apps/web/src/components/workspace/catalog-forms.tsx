"use client";
import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { Field } from "@/components/reference-ui";
import { Button } from "@/components/ui/button";
import { post, type CatalogMetadata, type CatalogProduct } from "@/lib/api";

export function PreviewCatalogNote() {
  return (
    <p className="mt-4 text-xs text-amber-700">
      Preview only: sign in to save product categories and products.
    </p>
  );
}
export function ProductNameForm({
  metadata,
  typeId,
  preview,
  onSaved,
}: {
  metadata: CatalogMetadata | null;
  typeId: string;
  preview: boolean;
  onSaved: (typeId: string) => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || preview) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setError("পণ্যের নাম লিখুন।");
      return;
    }
    const selected = String(form.get("typeId"));
    setError("");
    setSaving(true);
    try {
      await post("/categories", { typeId: selected, name });
      onSaved(selected);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "পণ্যের নাম সেভ করা যায়নি।",
      );
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-5 grid gap-4">
      <Field label="Product Category" required>
        <select
          name="typeId"
          defaultValue={typeId || metadata?.types[0]?.id || ""}
          required
        >
          {metadata?.types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Product Name" required>
        <input name="name" aria-label="Product name" required maxLength={160} />
      </Field>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || preview || !metadata?.types.length}
      >
        {saving ? "Saving..." : "Save Product Name"}
      </Button>
    </form>
  );
}
export function ProductForm({
  metadata,
  typeId,
  initialName = "",
  onTypeChange,
  onSaved,
  preview,
}: {
  metadata: CatalogMetadata | null;
  typeId: string;
  initialName?: string;
  onTypeChange: (id: string) => void;
  onSaved: (product: CatalogProduct) => void;
  preview: boolean;
}) {
  const [productName, setProductName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedId = typeId || metadata?.types[0]?.id || "";
  const names = (metadata?.categories ?? []).filter((category) =>
    category.typeIds?.includes(selectedId),
  );
  const type = metadata?.types.find((item) => item.id === selectedId);
  const individual = type?.trackingKind === "BATTERY_UNIT";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || saving || !type) return;
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    if (!text("name") || !text("unit")) {
      setError("পণ্যের নাম ও ইউনিট লিখুন।");
      return;
    }
    if (individual && !text("model")) {
      setError("পণ্যের মডেল লিখুন।");
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(
        await post<CatalogProduct>("/products", {
          typeId: selectedId,
          name: text("name"),
          model: text("model"),
          unit: text("unit"),
          category: text("name"),
          defaultSellingPrice: "0.00",
          lowStockThreshold: "0",
          warrantyMonths: Number(text("warrantyMonths")),
          ...(individual
            ? {
                capacityAh: text("capacityAh"),
              }
            : {}),
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "পণ্য সেভ করা যায়নি।");
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={saving} className="grid gap-4 md:grid-cols-3">
        <legend className="sr-only">Product information</legend>
        <div className="flex items-end gap-2 md:col-span-3">
          <Field label="Product Category" required className="flex-1">
            <select
              name="typeId"
              aria-label="New product category"
              value={selectedId}
              onChange={(event) => {
                setProductName("");
                onTypeChange(event.target.value);
              }}
              required
            >
              <option value="" disabled>
                ক্যাটাগরি নির্বাচন করুন
              </option>
              {metadata?.types.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Product Name" required>
          <select
            name="name"
            aria-label="Product name"
            value={
              names.some((name) => name.name === productName) ? productName : ""
            }
            onChange={(event) => setProductName(event.target.value)}
            disabled={!names.length}
            required
          >
            <option value="" disabled>
              {names.length
                ? "পণ্যের নাম নির্বাচন করুন"
                : "এই ক্যাটাগরিতে কোনো পণ্যের নাম নেই"}
            </option>
            {names.map((name) => (
              <option key={name.id} value={name.name}>
                {name.name}
              </option>
            ))}
          </select>
          {!names.length ? (
            <p className="mt-1 text-xs text-slate-500">
              Inventory / Stock থেকে এই ক্যাটাগরিতে পণ্যের নাম যোগ করুন।
            </p>
          ) : null}
        </Field>
        <Field label="Model Number" required={individual}>
          <input name="model" maxLength={160} required={individual} />
        </Field>
        <Field label="Unit" required>
          <input
            name="unit"
            placeholder="যেমন: pcs, set"
            maxLength={30}
            required
          />
        </Field>
        <Field label="Warranty (months)">
          <input
            name="warrantyMonths"
            type="number"
            min="0"
            max="600"
            step="1"
            defaultValue="0"
            onFocus={(event) => {
              if (event.currentTarget.value === "0")
                event.currentTarget.select();
            }}
            onChange={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(
                /^0+(?=\d)/,
                "",
              );
            }}
            required
          />
        </Field>
        {individual ? (
          <>
            <Field label="Capacity (Ah)" required>
              <input
                name="capacityAh"
                type="number"
                min="0.01"
                max="99999999.99"
                step="0.01"
                required
              />
            </Field>
          </>
        ) : null}
      </fieldset>
      {!metadata?.types.length && !preview ? (
        <p className="mt-4 text-xs text-slate-500">
          প্রথমে Inventory / Stock থেকে Product Category ও পণ্যের নাম যোগ করুন।
        </p>
      ) : null}
      <p className="mt-4 text-xs leading-6 text-slate-500">
        পণ্যের তথ্য সেভ করে quantity ও purchase price দিন। Receive &amp; Confirm
        করলে পণ্য স্টকে যোগ হবে।
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700"
        >
          {error}
        </p>
      ) : null}
      {preview ? <PreviewCatalogNote /> : null}
      <div className="mt-5 flex justify-end">
        <Button
          type="submit"
          disabled={saving || preview || !type || !names.length}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
          {saving ? "Saving..." : "Save Product"}
        </Button>
      </div>
    </form>
  );
}
