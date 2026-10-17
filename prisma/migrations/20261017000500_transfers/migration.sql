-- CreateTable
CREATE TABLE "FinancialTransfer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceAccountId" UUID NOT NULL,
    "destinationAccountId" UUID NOT NULL,
    "sentAmount" DECIMAL(20,4) NOT NULL,
    "receivedAmount" DECIMAL(20,4) NOT NULL,
    "exchangeRate" DECIMAL(50,30) NOT NULL,
    "feeAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "feeAccountId" UUID,
    "feeCategoryId" UUID,
    "feeCategoryKind" VARCHAR(7) NOT NULL DEFAULT 'expense',
    "date" DATE NOT NULL,
    "notes" VARCHAR(2000),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "requestId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinancialTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferRevision" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" VARCHAR(7) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialTransfer_userId_date_id_idx" ON "FinancialTransfer"("userId", "date", "id");

-- CreateIndex
CREATE INDEX "FinancialTransfer_userId_sourceAccountId_deletedAt_idx" ON "FinancialTransfer"("userId", "sourceAccountId", "deletedAt");

-- CreateIndex
CREATE INDEX "FinancialTransfer_userId_destinationAccountId_deletedAt_idx" ON "FinancialTransfer"("userId", "destinationAccountId", "deletedAt");

-- CreateIndex
CREATE INDEX "FinancialTransfer_userId_feeAccountId_deletedAt_idx" ON "FinancialTransfer"("userId", "feeAccountId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransfer_userId_id_key" ON "FinancialTransfer"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransfer_userId_requestId_key" ON "FinancialTransfer"("userId", "requestId");

-- CreateIndex
CREATE INDEX "TransferRevision_userId_transferId_revision_idx" ON "TransferRevision"("userId", "transferId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "TransferRevision_transferId_revision_key" ON "TransferRevision"("transferId", "revision");

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_userId_sourceAccountId_fkey" FOREIGN KEY ("userId", "sourceAccountId") REFERENCES "FinancialAccount"("userId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_userId_destinationAccountId_fkey" FOREIGN KEY ("userId", "destinationAccountId") REFERENCES "FinancialAccount"("userId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_userId_feeAccountId_fkey" FOREIGN KEY ("userId", "feeAccountId") REFERENCES "FinancialAccount"("userId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_userId_feeCategoryId_feeCategoryKind_fkey" FOREIGN KEY ("userId", "feeCategoryId", "feeCategoryKind") REFERENCES "Category"("userId", "id", "kind") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransferRevision" ADD CONSTRAINT "TransferRevision_userId_transferId_fkey" FOREIGN KEY ("userId", "transferId") REFERENCES "FinancialTransfer"("userId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Both principal movements are mandatory; the fee is an optional separate expense.
ALTER TABLE "FinancialTransfer"
  ADD CONSTRAINT "transfer_distinct_accounts" CHECK ("sourceAccountId" <> "destinationAccountId"),
  ADD CONSTRAINT "transfer_amounts" CHECK ("sentAmount" > 0 AND "receivedAmount" > 0 AND "sentAmount" <= 999999999999999.9999 AND "receivedAmount" <= 999999999999999.9999),
  ADD CONSTRAINT "transfer_rate" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "transfer_fee" CHECK ("feeAmount" >= 0 AND "feeAmount" <= 999999999999999.9999 AND (("feeAmount" = 0 AND "feeAccountId" IS NULL AND "feeCategoryId" IS NULL) OR ("feeAmount" > 0 AND "feeAccountId" IS NOT NULL))),
  ADD CONSTRAINT "transfer_fee_kind" CHECK ("feeCategoryKind" = 'expense'),
  ADD CONSTRAINT "transfer_revision" CHECK ("revision" > 0);
ALTER TABLE "TransferRevision" ADD CONSTRAINT "transfer_revision_action" CHECK ("action" IN ('created','updated','deleted'));
-- Deferred restrictive references let owner removal finish all private-data cascades.
ALTER TABLE "FinancialTransfer" ALTER CONSTRAINT "FinancialTransfer_userId_sourceAccountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinancialTransfer" ALTER CONSTRAINT "FinancialTransfer_userId_destinationAccountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinancialTransfer" ALTER CONSTRAINT "FinancialTransfer_userId_feeAccountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinancialTransfer" ALTER CONSTRAINT "FinancialTransfer_userId_feeCategoryId_feeCategoryKind_fkey" DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "TransferRevision_owner_source_idx" ON "TransferRevision" ("userId", ("snapshot"->>'sourceAccountId'));
CREATE INDEX "TransferRevision_owner_destination_idx" ON "TransferRevision" ("userId", ("snapshot"->>'destinationAccountId'));
CREATE INDEX "TransferRevision_owner_fee_idx" ON "TransferRevision" ("userId", ("snapshot"->>'feeAccountId'));
