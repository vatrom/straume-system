-- Salgshistorikk beholdes som egne rader. Fase- og verdiendringer refererer til navn, ikke bare til en rad som kan slettes.

ALTER TABLE "Deal" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Deal" ADD COLUMN "area" TEXT;
CREATE INDEX "Deal_wonAt_idx" ON "Deal"("wonAt");
CREATE INDEX "Deal_lostAt_idx" ON "Deal"("lostAt");
CREATE INDEX "Deal_createdAt_idx" ON "Deal"("createdAt");
CREATE INDEX "Deal_area_idx" ON "Deal"("area");

CREATE TABLE "DealStageEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "fromStageName" TEXT,
    "toStageId" TEXT,
    "toStageName" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealStageEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DealStageEvent_dealId_at_idx" ON "DealStageEvent"("dealId", "at");
CREATE INDEX "DealStageEvent_at_idx" ON "DealStageEvent"("at");
ALTER TABLE "DealStageEvent" ADD CONSTRAINT "DealStageEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DealValueEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromValue" DECIMAL(12,2) NOT NULL,
    "toValue" DECIMAL(12,2) NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealValueEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DealValueEvent_dealId_at_idx" ON "DealValueEvent"("dealId", "at");
ALTER TABLE "DealValueEvent" ADD CONSTRAINT "DealValueEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "options" JSONB,
    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomField_key_key" ON "CustomField"("key");

CREATE TABLE "DealFieldValue" (
    "dealId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "DealFieldValue_pkey" PRIMARY KEY ("dealId","fieldId")
);
ALTER TABLE "DealFieldValue" ADD CONSTRAINT "DealFieldValue_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealFieldValue" ADD CONSTRAINT "DealFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SalesGoal" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "target" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesGoal_ownerId_periodStart_idx" ON "SalesGoal"("ownerId", "periodStart");
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "spec" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InsightDashboard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsightDashboard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InsightDashboard_slug_key" ON "InsightDashboard"("slug");
ALTER TABLE "InsightDashboard" ADD CONSTRAINT "InsightDashboard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DashboardTile" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "reportId" TEXT,
    "title" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "view" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "DashboardTile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DashboardTile_dashboardId_sortOrder_idx" ON "DashboardTile"("dashboardId", "sortOrder");
ALTER TABLE "DashboardTile" ADD CONSTRAINT "DashboardTile_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "InsightDashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DashboardTile" ADD CONSTRAINT "DashboardTile_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SavedReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
