"use client";
import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/reference-ui";
import { post } from "@/lib/api";
import { useCatalogResource } from "@/lib/use-catalog-resource";

type DeletedItem = {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  deletedAt: string;
  type: string;
};

export function RecycleBinView({ preview }: { preview: boolean }) {
  const [revision, setRevision] = useState(0);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const items = useCatalogResource<DeletedItem[]>(
    preview ? null : "/suppliers/recycle-bin",
    revision,
  );
  async function restore(item: DeletedItem) {
    if (restoring || preview) return;
    setRestoring(item.id);
    setError("");
    setMessage("");
    try {
      await post(`/suppliers/recycle-bin/${item.id}/restore`, {});
      setMessage(`${item.name} পুনরুদ্ধার করা হয়েছে।`);
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Restore করা যায়নি।");
    } finally {
      setRestoring(null);
    }
  }
  return (
    <Panel title="Recycle Bin" icon={Trash2}>
      <p className="px-4 py-3 text-sm text-slate-500">
        এখান থেকে মুছে দেওয়া সাপ্লায়ার Restore করতে পারবেন।
      </p>
      {message ? (
        <p
          role="status"
          className="mx-4 mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-800"
        >
          {message}
        </p>
      ) : null}
      {error || items.error ? (
        <div
          role="alert"
          className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error || items.error}
          <Button
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {items.loading ? (
        <p role="status" className="p-8 text-center">
          Loading deleted items...
        </p>
      ) : items.data?.length ? (
        <div className="erp-table-wrap">
          <table className="erp-table">
            <caption className="sr-only">Deleted items</caption>
            <thead>
              <tr>
                {[
                  "নাম",
                  "ধরন",
                  "কোম্পানি",
                  "মোবাইল",
                  "মুছে ফেলার সময়",
                  "অ্যাকশন",
                ].map((heading) => (
                  <th key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.data.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.type}</td>
                  <td>{item.company || "—"}</td>
                  <td>{item.phone || "—"}</td>
                  <td>
                    {new Date(item.deletedAt).toLocaleString("en-GB", {
                      timeZone: "Asia/Dhaka",
                    })}
                  </td>
                  <td>
                    <Button
                      variant="outline"
                      disabled={Boolean(restoring)}
                      onClick={() => restore(item)}
                      aria-label={`Restore ${item.name}`}
                    >
                      <RotateCcw />
                      {restoring === item.id ? "Restoring..." : "Restore"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !items.error ? (
        <p className="p-10 text-center text-sm text-slate-500">
          Recycle Bin খালি।
        </p>
      ) : null}
    </Panel>
  );
}
