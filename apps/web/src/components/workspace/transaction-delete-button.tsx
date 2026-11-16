"use client";
import { useState, type FormEvent } from "react";
import { AlertDialog } from "radix-ui";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { api, csrf } from "@/lib/api";
import { notifyDashboardUpdate } from "@/lib/use-dashboard";

export function TransactionDeleteButton({
  kind,
  id,
  label,
  preview = false,
  onDeleted,
}: {
  kind: "sales" | "purchases";
  id: string;
  label: string;
  preview?: boolean;
  onDeleted: () => void;
}) {
  const user = useSession();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!preview && !user?.permissions.includes("transactions.reverse"))
    return null;
  const title = kind === "sales" ? "Delete Sale" : "Delete Purchase";
  async function remove(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (saving || preview || !confirmed) return;
    setSaving(true);
    setError("");
    try {
      await api(`/${kind}/${id}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": await csrf() },
        body: JSON.stringify({ confirmed: true }),
      });
      setOpen(false);
      onDeleted();
      notifyDashboardUpdate();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Delete failed. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!saving) {
          setOpen(value);
          if (value) {
            setConfirmed(false);
            setError("");
          }
        }
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete ${label}`}
          disabled={preview}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 />
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
        <AlertDialog.Content
          className="feature-dialog transaction-delete-dialog"
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          <AlertDialog.Title className="text-lg font-bold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-slate-600">
            {label} সম্পূর্ণ বাতিল হবে। স্টক, পেমেন্ট ও বকেয়ার হিসাব সমন্বয় হবে।
            ইতিহাস সংরক্ষিত থাকবে।
            {kind === "purchases"
              ? " ব্যবহার হওয়া স্টক থাকলে ক্রয় বাতিল করা যাবে না।"
              : " বিক্রি করা সব পণ্য একই পরিমাণে স্টকে ফেরত যাবে। রিটার্ন বা ওয়ারেন্টি দাবি থাকলে বিক্রয় বাতিল করা যাবে না।"}
          </AlertDialog.Description>
          <form className="mt-4 grid gap-4" onSubmit={remove}>
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={saving}
                required
              />
              পণ্য ও পরিশোধের টাকা ফেরত দেওয়া/পাওয়া নিশ্চিত করেছি।
            </label>
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="outline" disabled={saving}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button
                type="submit"
                className="bg-red-600 hover:bg-red-700"
                disabled={saving || !confirmed}
              >
                {saving ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                {saving ? "Deleting..." : title}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
