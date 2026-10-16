CREATE TABLE "Category" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "kind" VARCHAR(7) NOT NULL,
  "name" VARCHAR(60) NOT NULL,
  "description" VARCHAR(240),
  "color" VARCHAR(10) NOT NULL,
  "icon" VARCHAR(12) NOT NULL,
  "parentId" UUID,
  "position" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Category_kind_valid" CHECK ("kind" IN ('income', 'expense')),
  CONSTRAINT "Category_name_valid" CHECK (length(trim("name")) > 0),
  CONSTRAINT "Category_color_valid" CHECK ("color" IN ('slate', 'lime', 'blue', 'purple', 'orange', 'rose')),
  CONSTRAINT "Category_icon_valid" CHECK ("icon" IN ('tag', 'home', 'food', 'transport', 'shopping', 'income', 'health', 'education', 'travel', 'gift', 'leisure', 'work')),
  CONSTRAINT "Category_position_valid" CHECK ("position" >= 0),
  CONSTRAINT "Category_not_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id")
);
CREATE UNIQUE INDEX "Category_userId_id_kind_key" ON "Category"("userId", "id", "kind");
ALTER TABLE "Category" ADD CONSTRAINT "Category_parent_owner_kind_fkey"
  FOREIGN KEY ("userId", "parentId", "kind") REFERENCES "Category"("userId", "id", "kind") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "Category_userId_kind_parentId_position_id_idx" ON "Category"("userId", "kind", "parentId", "position", "id");
-- Names are reserved within their sibling group, including archived categories.
CREATE UNIQUE INDEX "Category_sibling_name_key" ON "Category"("userId", "kind", COALESCE("parentId", '00000000-0000-0000-0000-000000000000'::uuid), lower("name"));
