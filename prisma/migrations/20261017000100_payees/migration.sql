CREATE TABLE "Payee" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "kind" VARCHAR(12) NOT NULL,
  "notes" VARCHAR(500),
  "archivedAt" TIMESTAMPTZ(3),
  "mergedIntoId" UUID,
  "mergedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Payee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Payee_kind_valid" CHECK ("kind" IN ('person', 'merchant', 'organization')),
  CONSTRAINT "Payee_name_valid" CHECK (length(trim("name")) > 0),
  CONSTRAINT "Payee_not_self_merge" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id"),
  CONSTRAINT "Payee_merge_status_valid" CHECK (
    ("mergedIntoId" IS NULL AND "mergedAt" IS NULL) OR
    ("mergedIntoId" IS NOT NULL AND "mergedAt" IS NOT NULL AND "archivedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "Payee_userId_id_key" ON "Payee"("userId", "id");
ALTER TABLE "Payee" ADD CONSTRAINT "Payee_merge_owner_fkey"
  FOREIGN KEY ("userId", "mergedIntoId") REFERENCES "Payee"("userId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "Payee_userId_mergedIntoId_archivedAt_createdAt_id_idx" ON "Payee"("userId", "mergedIntoId", "archivedAt", "createdAt", "id");
