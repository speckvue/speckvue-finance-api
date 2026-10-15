ALTER TABLE "User"
  ADD COLUMN "displayName" VARCHAR(80),
  ADD COLUMN "baseCurrency" CHAR(3),
  ADD COLUMN "locale" VARCHAR(40),
  ADD COLUMN "timezone" VARCHAR(100),
  ADD COLUMN "theme" VARCHAR(6) NOT NULL DEFAULT 'system',
  ADD COLUMN "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "onboardedAt" TIMESTAMPTZ(3),
  ADD COLUMN "credentialsVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD COLUMN "credentialsVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_theme_valid" CHECK ("theme" IN ('system', 'light', 'dark'));
ALTER TABLE "User" ADD CONSTRAINT "User_week_start_valid" CHECK ("weekStartsOn" BETWEEN 0 AND 6);
