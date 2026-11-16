-- Refunds and supplier recoveries reverse an existing payment and its journal.
ALTER TABLE "Payment" DROP CONSTRAINT "payment_positive_party";
ALTER TABLE "Payment" ADD CONSTRAINT "payment_positive_party" CHECK (
  "amount" > 0 AND (
    ("direction" = 'INCOMING' AND "customerId" IS NOT NULL AND "supplierId" IS NULL)
    OR ("direction" = 'OUTGOING' AND "supplierId" IS NOT NULL AND "customerId" IS NULL)
    OR ("reversedPaymentId" IS NOT NULL AND num_nonnulls("customerId", "supplierId") = 1)
  )
);
