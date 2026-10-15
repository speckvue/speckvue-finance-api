CREATE TABLE "FinancialAccount" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "openingBalance" DECIMAL(20,4) NOT NULL,
  "openingBalanceDate" DATE NOT NULL,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinancialAccount_type_valid" CHECK ("type" IN ('bank', 'cash', 'credit_card', 'investment', 'loan', 'other')),
  CONSTRAINT "FinancialAccount_name_valid" CHECK (length(trim("name")) > 0),
  CONSTRAINT "FinancialAccount_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "FinancialAccount_userId_archivedAt_id_idx" ON "FinancialAccount"("userId", "archivedAt", "id");
