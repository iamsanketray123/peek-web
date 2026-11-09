-- Additive, idempotent setup for installations that use prisma db push rather
-- than migration history. No existing tables or app data are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS "KeywordExperiment" (
  "id" TEXT PRIMARY KEY, "appId" TEXT NOT NULL REFERENCES "TrackedApp"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL, "hypothesis" TEXT NOT NULL, "keywords" TEXT[] NOT NULL,
  "before" TEXT NOT NULL, "after" TEXT NOT NULL, "baselineStart" DATE NOT NULL,
  "startDate" DATE NOT NULL, "endDate" DATE NOT NULL, "settleDays" INTEGER NOT NULL DEFAULT 3,
  "status" TEXT NOT NULL DEFAULT 'running', "conclusion" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "KeywordExperiment_appId_startDate_idx" ON "KeywordExperiment"("appId", "startDate");
CREATE TABLE IF NOT EXISTS "ExperimentEvent" (
  "id" TEXT PRIMARY KEY, "appId" TEXT NOT NULL REFERENCES "TrackedApp"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "startDate" DATE NOT NULL, "endDate" DATE NOT NULL,
  "cooldownDays" INTEGER NOT NULL DEFAULT 3, "url" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExperimentEvent_appId_startDate_idx" ON "ExperimentEvent"("appId", "startDate");
CREATE TABLE IF NOT EXISTS "AcquisitionDay" (
  "id" TEXT PRIMARY KEY, "appId" TEXT NOT NULL REFERENCES "TrackedApp"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "date" DATE NOT NULL, "searchDownloads" INTEGER, "webReferrals" INTEGER,
  "appReferrals" INTEGER, "browseDownloads" INTEGER, "sourceNote" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "AcquisitionDay_appId_date_key" ON "AcquisitionDay"("appId", "date");
-- Match the existing app data pattern: browser roles must not bypass server
-- ownership checks. Prisma connects as the privileged server DB role.
ALTER TABLE "KeywordExperiment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExperimentEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcquisitionDay" ENABLE ROW LEVEL SECURITY;
COMMIT;
