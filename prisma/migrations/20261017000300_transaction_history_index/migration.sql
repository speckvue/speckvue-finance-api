-- Account history remains discoverable after an entry is moved to another account.
CREATE INDEX "TransactionRevision_owner_account_idx" ON "TransactionRevision" ("userId", ("snapshot"->>'accountId'));
ALTER TABLE "ManualTransaction" DROP CONSTRAINT "transaction_revision";
ALTER TABLE "ManualTransaction" ADD CONSTRAINT "transaction_revision" CHECK ("revision" > 0);
