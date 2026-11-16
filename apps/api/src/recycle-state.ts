import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export async function lockBinEntry(
  tx: Prisma.TransactionClient,
  entryId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"recycle-bin:" + entryId}, 0))`;
  const resolved = await tx.auditLog.findFirst({
    where: {
      action: {
        in: [
          "RECYCLE_BIN_RESTORED",
          "RECYCLE_BIN_FINALIZED",
          "SUPPLIER_RESTORED",
        ],
      },
      OR: [
        { metadata: { path: ["entryId"], equals: entryId } },
        { metadata: { path: ["deletionId"], equals: entryId } },
      ],
    },
  });
  if (resolved)
    throw new ConflictException(
      "This item has already been restored or permanently removed. Refresh the Recycle Bin.",
    );
}
