-- Future ledger rows can reference (userId, accountId) together to enforce ownership.
CREATE UNIQUE INDEX "FinancialAccount_userId_id_key" ON "FinancialAccount"("userId", "id");
