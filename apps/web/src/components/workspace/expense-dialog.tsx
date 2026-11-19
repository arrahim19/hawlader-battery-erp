"use client";
import { randomId } from "@/lib/random-id";
import { useRef, useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { LoaderCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/reference-ui";
import { post, type ExpenseOptions } from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { notifyDashboardUpdate } from "@/lib/use-dashboard";
import { useBusinessDate } from "@/lib/use-business-date";

function ExpenseForm({
  preview,
  onSaved,
  onSavingChange,
}: {
  preview: boolean;
  onSaved: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const today = useBusinessDate();
  const options = useCatalogResource<ExpenseOptions>(
    preview ? null : "/expenses/options",
    0,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submission = useRef<{ signature: string; key: string } | null>(null);
  const submitting = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (preview || submitting.current) return;
    const form = new FormData(event.currentTarget);
    const body = {
      expenseDate: String(form.get("expenseDate")),
      category: String(form.get("category")),
      description: String(form.get("description")).trim(),
      amount: String(form.get("amount")),
    };
    const signature = JSON.stringify(body);
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: randomId() };
    submitting.current = true;
    setSaving(true);
    onSavingChange(true);
    setError("");
    try {
      await post("/expenses", body, {
        "Idempotency-Key": submission.current.key,
      });
      notifyDashboardUpdate();
      onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Expense could not be saved.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  }
  return (
    <form className="mt-4 grid gap-4" onSubmit={save}>
      <fieldset
        disabled={saving || options.loading || Boolean(options.error)}
        className="expense-entry-grid grid grid-cols-3 gap-3 border-0 p-0"
      >
        <legend className="sr-only">Expense details</legend>
        <Field label="Expense Date" required>
          <input
            type="date"
            name="expenseDate"
            aria-label="Expense date"
            defaultValue={today}
            required
          />
        </Field>
        <Field label="Category" required>
          <select
            name="category"
            aria-label="Expense category"
            defaultValue=""
            required
          >
            <option value="" disabled>
              Select category
            </option>
            {(
              options.data?.categories ??
              (preview ? ["Office Expense", "Transport", "Others"] : [])
            ).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (৳)" required>
          <input
            type="number"
            name="amount"
            aria-label="Expense amount"
            min="0.01"
            max="99999999999999.99"
            step="0.01"
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="Description" className="col-span-3">
          <input
            name="description"
            aria-label="Expense description"
            placeholder="খরচের বিবরণ লিখুন"
            maxLength={500}
          />
        </Field>
      </fieldset>
      {options.error || error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {options.error || error}
        </p>
      ) : null}
      {!preview && options.data && !options.data.cashAvailable ? (
        <p role="alert" className="text-sm text-red-700">
          Cash হিসাব সক্রিয় নেই।
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Dialog.Close asChild>
          <Button type="button" variant="outline" disabled={saving}>
            Cancel
          </Button>
        </Dialog.Close>
        <Button
          type="submit"
          disabled={
            preview || saving || options.loading || !options.data?.cashAvailable
          }
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
          {saving ? "Saving..." : "Save Expense"}
        </Button>
      </div>
    </form>
  );
}

export function ExpenseDialog({
  preview,
  open,
  onOpenChange,
  onSaved,
}: {
  preview: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
        <Dialog.Content
          className="feature-dialog expense-dialog"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          <Dialog.Title className="text-lg font-bold">Add Expense</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-slate-500">
            খরচের তথ্য দিন।
          </Dialog.Description>
          <ExpenseForm
            preview={preview}
            onSavingChange={setSaving}
            onSaved={() => {
              onSaved();
              onOpenChange(false);
            }}
          />
          <Dialog.Close
            aria-label="Close expense dialog"
            disabled={saving}
            className="absolute top-4 right-4"
          >
            <X size={18} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
