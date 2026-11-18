"use client";
import { useState, type FormEvent } from "react";
import { AlertDialog } from "radix-ui";
import { RotateCcw, Trash2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/reference-ui";
import { api, csrf } from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";
import { notifyDashboardUpdate } from "@/lib/use-dashboard";

type DeletedItem = {
  id: string;
  name: string;
  type: "Supplier" | "Sale" | "Purchase";
  party: string | null;
  amount: string | null;
  deletedAt: string;
};
export function RecycleBinView({ preview }: { preview: boolean }) {
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<{
    item: DeletedItem;
    final: boolean;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [removed, setRemoved] = useState<string[]>([]);
  const items = useCatalogResource<DeletedItem[]>(
    preview ? null : "/recycle-bin",
    revision,
    true,
  );
  const rows = (items.data ?? []).filter((item) => !removed.includes(item.id));
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages);
  function select(item: DeletedItem, final: boolean) {
    setSelection({ item, final });
    setConfirmed(false);
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!selection || saving || preview || !confirmed) return;
    setSaving(true);
    setError("");
    try {
      await api(
        "/recycle-bin/" +
          selection.item.id +
          (selection.final ? "" : "/restore"),
        {
          method: selection.final ? "DELETE" : "POST",
          headers: { "X-CSRF-Token": await csrf() },
          body: JSON.stringify({ confirmed: true }),
        },
      );
      setRemoved((previous) => [...previous, selection.item.id]);
      setMessage(
        selection.item.name +
          (selection.final
            ? " Recycle Bin থেকে স্থায়ীভাবে সরানো হয়েছে।"
            : " Restore করা হয়েছে।"),
      );
      setSelection(null);
      setRevision((value) => value + 1);
      notifyDashboardUpdate();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel title="Recycle Bin" icon={Trash2}>
      <p className="px-4 py-3 text-xs text-slate-500">
        মুছে দেওয়া Sale, Purchase ও Supplier এখানে থাকবে। Restore করুন অথবা Final
        Delete করে স্থায়ীভাবে Bin থেকে সরান।
      </p>
      {message ? (
        <p
          role="status"
          className="mx-4 mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-800"
        >
          {message}
        </p>
      ) : null}
      {items.error ? (
        <div
          role="alert"
          className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {items.error}
          <Button
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {items.loading || rows.length ? (
        <>
          <div className="erp-table-wrap" aria-busy={items.loading}>
            <table className="erp-table">
              <caption className="sr-only">Deleted items</caption>
              <thead>
                <tr>
                  {[
                    "Name / Invoice",
                    "Type",
                    "Customer / Supplier",
                    "Amount (৳)",
                    "Deleted at",
                    "Action",
                  ].map((heading) => (
                    <th key={heading} scope="col">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.loading ? (
                  <tr>
                    <td colSpan={6} className="h-32">
                      <span role="status" className="sr-only">
                        Loading deleted items...
                      </span>
                    </td>
                  </tr>
                ) : null}
                {rows.slice((current - 1) * 10, current * 10).map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.type}</td>
                    <td>{item.party || "—"}</td>
                    <td>
                      {item.amount === null
                        ? "—"
                        : "৳" +
                          Number(item.amount).toLocaleString("en-BD", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                    </td>
                    <td>
                      {new Date(item.deletedAt).toLocaleString("en-GB", {
                        timeZone: "Asia/Dhaka",
                      })}
                    </td>
                    <td>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={preview || saving}
                          onClick={() => select(item, false)}
                          aria-label={"Restore " + item.name}
                        >
                          <RotateCcw />
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50"
                          disabled={preview || saving}
                          onClick={() => select(item, true)}
                          aria-label={"Final Delete " + item.name}
                        >
                          <Trash2 />
                          Final Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 p-4 text-xs text-slate-500">
            <span>
              {rows.length} items · Page {current} / {pages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : !items.error ? (
        <p className="p-10 text-center text-sm text-slate-500">
          Recycle Bin খালি।
        </p>
      ) : null}
      <AlertDialog.Root
        open={Boolean(selection)}
        onOpenChange={(value) => {
          if (!saving && !value) setSelection(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-60 bg-slate-950/40" />
          <AlertDialog.Content
            className="feature-dialog transaction-delete-dialog"
            onEscapeKeyDown={(event) => {
              if (saving) event.preventDefault();
            }}
          >
            <AlertDialog.Title className="text-lg font-bold">
              {selection?.final ? "Final Delete" : "Restore"}{" "}
              {selection?.item.type}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-slate-600">
              {selection?.item.name} —{" "}
              {selection?.final
                ? "Recycle Bin থেকে স্থায়ীভাবে সরবে। এরপর আর Restore করা যাবে না। হিসাব ও audit history সংরক্ষিত থাকবে।"
                : selection?.item.type === "Supplier"
                  ? "সাপ্লায়ারটি আবার তালিকায় ফিরবে।"
                  : "স্টক, পেমেন্ট ও বকেয়ার আগের হিসাব পুনরায় চালু হবে। প্রয়োজনীয় স্টক পাওয়া গেলে একই রেকর্ড Restore হবে।"}
            </AlertDialog.Description>
            <form className="mt-4 grid gap-4" onSubmit={submit}>
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  required
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={saving}
                />
                {selection?.final
                  ? "স্থায়ীভাবে Bin থেকে সরানো নিশ্চিত করছি।"
                  : "Restore এবং প্রযোজ্য স্টক ও পেমেন্টের হিসাব নিশ্চিত করছি।"}
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
                  disabled={saving || !confirmed}
                  className={
                    selection?.final ? "bg-red-600 hover:bg-red-700" : undefined
                  }
                >
                  {saving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : selection?.final ? (
                    <Trash2 />
                  ) : (
                    <RotateCcw />
                  )}
                  {saving
                    ? "Saving..."
                    : selection?.final
                      ? "Final Delete"
                      : "Restore"}
                </Button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Panel>
  );
}
