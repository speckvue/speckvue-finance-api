-- CreateTable
CREATE TABLE "ManualTransaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "payeeId" UUID,
    "kind" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "date" DATE NOT NULL,
    "notes" VARCHAR(2000),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "requestId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ManualTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionSplit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "categoryId" UUID,
    "categoryKind" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionRevision" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" VARCHAR(7) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualTransaction_userId_date_id_idx" ON "ManualTransaction"("userId", "date", "id");

-- CreateIndex
CREATE INDEX "ManualTransaction_userId_accountId_deletedAt_idx" ON "ManualTransaction"("userId", "accountId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualTransaction_userId_id_key" ON "ManualTransaction"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ManualTransaction_userId_requestId_key" ON "ManualTransaction"("userId", "requestId");

-- CreateIndex
CREATE INDEX "TransactionSplit_userId_categoryId_idx" ON "TransactionSplit"("userId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionSplit_transactionId_position_key" ON "TransactionSplit"("transactionId", "position");

-- CreateIndex
CREATE INDEX "TransactionRevision_userId_transactionId_revision_idx" ON "TransactionRevision"("userId", "transactionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionRevision_transactionId_revision_key" ON "TransactionRevision"("transactionId", "revision");

-- AddForeignKey
ALTER TABLE "ManualTransaction" ADD CONSTRAINT "ManualTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ManualTransaction" ADD CONSTRAINT "ManualTransaction_userId_accountId_fkey" FOREIGN KEY ("userId", "accountId") REFERENCES "FinancialAccount"("userId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ManualTransaction" ADD CONSTRAINT "ManualTransaction_userId_payeeId_fkey" FOREIGN KEY ("userId", "payeeId") REFERENCES "Payee"("userId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_userId_transactionId_fkey" FOREIGN KEY ("userId", "transactionId") REFERENCES "ManualTransaction"("userId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_userId_categoryId_categoryKind_fkey" FOREIGN KEY ("userId", "categoryId", "categoryKind") REFERENCES "Category"("userId", "id", "kind") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionRevision" ADD CONSTRAINT "TransactionRevision_userId_transactionId_fkey" FOREIGN KEY ("userId", "transactionId") REFERENCES "ManualTransaction"("userId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Keep fundamental ledger invariants even when writes bypass DTO validation.
ALTER TABLE "ManualTransaction" ADD CONSTRAINT "transaction_kind" CHECK ("kind" IN ('income','expense','refund')), ADD CONSTRAINT "transaction_amount" CHECK ("amount" > 0 AND "amount" <= 999999999999999.9999), ADD CONSTRAINT "transaction_revision" CHECK ("revision" BETWEEN 1 AND 101);
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "split_amount" CHECK ("amount" > 0), ADD CONSTRAINT "split_kind" CHECK ("categoryKind" IN ('income','expense')), ADD CONSTRAINT "split_position" CHECK ("position" BETWEEN 0 AND 19);
ALTER TABLE "TransactionRevision" ADD CONSTRAINT "revision_action" CHECK ("action" IN ('created','updated','deleted'));
