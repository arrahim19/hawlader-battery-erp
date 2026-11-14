"use client";
import { useId, useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { Field } from "@/components/reference-ui";
import { Button } from "@/components/ui/button";
import { post, type CustomerRecord } from "@/lib/api";

export function CustomerForm({
  preview,
  onSaved,
  onCancel,
}: {
  preview: boolean;
  onSaved: (customer: CustomerRecord) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || saving) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const name = text("name");
    const phone = text("phone");
    const address = text("address");
    const vehicleType = text("vehicleType");
    const vehicleIdentifier = text("vehicleIdentifier");
    if (!name || !/^[+0-9][0-9 ()-]{5,29}$/.test(phone)) {
      setError("Enter the customer's name and a valid mobile number.");
      return;
    }
    if (vehicleIdentifier && !vehicleType) {
      setError("Enter the vehicle type for this registration or identifier.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const customer = await post<CustomerRecord>("/customers", {
        name,
        phone,
        ...(address ? { address } : {}),
        ...(vehicleType
          ? { vehicleType, ...(vehicleIdentifier ? { vehicleIdentifier } : {}) }
          : {}),
      });
      onSaved(customer);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save the customer.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save} aria-busy={saving} className="grid gap-4">
      <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="sr-only">
          Customer contact and vehicle information
        </legend>
        <Field label="Customer Name" required>
          <input
            name="name"
            aria-label="Customer name"
            autoComplete="name"
            required
            maxLength={160}
          />
        </Field>
        <Field label="Mobile Number" required>
          <input
            name="phone"
            aria-label="Customer mobile number"
            type="tel"
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            required
            maxLength={30}
          />
        </Field>
        <Field label="Address (Optional)" className="sm:col-span-2">
          <textarea
            name="address"
            aria-label="Customer address (optional)"
            autoComplete="street-address"
            maxLength={500}
          />
        </Field>
        <Field label="Vehicle Type (Optional)">
          <input
            name="vehicleType"
            aria-label="Vehicle type (optional)"
            placeholder="Car, motorcycle, easy bike..."
            maxLength={100}
            aria-describedby={id + "-vehicle-hint"}
          />
        </Field>
        <Field label="Vehicle / Registration Number (Optional)">
          <input
            name="vehicleIdentifier"
            aria-label="Vehicle identifier (optional)"
            maxLength={160}
            aria-describedby={id + "-vehicle-hint"}
          />
        </Field>
        <p
          id={id + "-vehicle-hint"}
          className="text-xs text-slate-500 sm:col-span-2"
        >
          Vehicle details are optional. Enter a vehicle type when adding a
          registration or identifier.
        </p>
      </fieldset>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {preview ? (
        <p className="text-xs text-amber-700">Sign in to save customers.</p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={preview || saving}>
          {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
          {saving ? "Saving..." : "Save Customer"}
        </Button>
      </div>
    </form>
  );
}
