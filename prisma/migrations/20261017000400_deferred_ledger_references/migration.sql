-- Owner deletion cascades through multiple related branches. Validate ledger references
-- at commit, after those cascades complete, while retaining restrictive normal deletes.
ALTER TABLE "ManualTransaction" ALTER CONSTRAINT "ManualTransaction_userId_accountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ManualTransaction" ALTER CONSTRAINT "ManualTransaction_userId_payeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TransactionSplit" ALTER CONSTRAINT "TransactionSplit_userId_categoryId_categoryKind_fkey" DEFERRABLE INITIALLY DEFERRED;
