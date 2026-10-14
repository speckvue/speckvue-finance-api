-- Preserve existing account records outside the application's active schema.
CREATE SCHEMA IF NOT EXISTS speckvue_archive;
ALTER TABLE "public"."Account" SET SCHEMA speckvue_archive;
