import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SuppliersController } from "../apps/api/src/suppliers";
import type { DatabaseService } from "../apps/api/src/database.service";
import type { AuthRequest } from "../apps/api/src/auth";

test("supplier deletion saves a complete snapshot and restoration preserves its identity", async () => {
  const original = {
    id: "supplier-id",
    name: "Example",
    company: "Company",
    phone: "01712345678",
    address: "Dhaka",
    active: true,
    productTypeId: "battery",
    brandId: null,
    version: 3,
    createdAt: new Date("2026-11-15T00:00:00Z"),
  };
  let supplier: typeof original | null = original;
  type Entry = {
    id: string;
    createdAt: Date;
    action: string;
    metadata: { supplier?: typeof original; deletionId?: string };
  };
  const entries: Entry[] = [];
  const tx = {
    supplier: {
      findUnique: async () => supplier,
      findMany: async () => (supplier ? [{ id: supplier.id }] : []),
      delete: async () => {
        supplier = null;
      },
      create: async ({ data }: { data: typeof original }) => {
        supplier = data;
        return data;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const entry = {
          id: `entry-${entries.length}`,
          createdAt: new Date(),
          ...data,
        };
        entries.push(entry as Entry);
        return entry;
      },
      findMany: async () =>
        entries
          .filter((entry) => entry.action === "SUPPLIER_DELETED")
          .reverse(),
      findFirst: async () =>
        [...entries]
          .reverse()
          .find((entry) => entry.action === "SUPPLIER_DELETED"),
    },
  };
  const db = {
    ...tx,
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  };
  const controller = new SuppliersController(db as unknown as DatabaseService);
  const request = {
    currentUser: { id: "owner" },
    requestId: "request",
  } as AuthRequest;
  await controller.remove(original.id, { confirmed: true }, request);
  assert.equal(supplier, null);
  assert.equal(entries[0].metadata.supplier?.phone, original.phone);
  assert.equal((await controller.recycleBin()).data.length, 1);
  await controller.restore("entry-0", request);
  assert.deepEqual(supplier, original);
  assert.equal((await controller.recycleBin()).data.length, 0);
  await assert.rejects(
    controller.restore("entry-0", request),
    /already been restored/,
  );
  assert.equal(
    entries.filter((entry) => entry.action === "SUPPLIER_RESTORED").length,
    1,
  );
});
