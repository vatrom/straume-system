-- Salgsavtale og prosjekt er separate. Befaring og dokumenter kan ligge på avtalen til prosjektet opprettes.

ALTER TABLE "ProjectPhase" ADD COLUMN "rottenDays" INTEGER;

ALTER TABLE "Project" ADD COLUMN "plannedEndDate" DATE;
ALTER TABLE "Project" ADD COLUMN "phaseEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Document" ADD COLUMN "dealId" TEXT;
ALTER TABLE "Document" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Document" ADD CONSTRAINT "Document_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Document_dealId_idx" ON "Document"("dealId");

ALTER TABLE "Inspection" ADD COLUMN "dealId" TEXT;
ALTER TABLE "Inspection" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Inspection_dealId_idx" ON "Inspection"("dealId");

ALTER TABLE "Floor" ADD COLUMN "dealId" TEXT;
ALTER TABLE "Floor" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Floor_dealId_idx" ON "Floor"("dealId");

ALTER TABLE "Media" ADD COLUMN "dealId" TEXT;
ALTER TABLE "Media" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Media" ADD CONSTRAINT "Media_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Media_dealId_idx" ON "Media"("dealId");

ALTER TABLE "Note" ADD COLUMN "dealId" TEXT;
ALTER TABLE "Note" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Note" ADD CONSTRAINT "Note_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Note_dealId_idx" ON "Note"("dealId");
