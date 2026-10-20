-- Fase 2: tilbud, prisdatabase, produktkatalog og stykkliste

ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'accepted';

ALTER TABLE "PriceList"
  ADD COLUMN "vatRate" DECIMAL(6,4) NOT NULL DEFAULT 0.25,
  ADD COLUMN "byggstartPercent" DECIMAL(6,4) NOT NULL DEFAULT 0.07,
  ADD COLUMN "byggstartFactor" DECIMAL(6,3) NOT NULL DEFAULT 1.3,
  ADD COLUMN "mittanbudPercent" DECIMAL(6,4) NOT NULL DEFAULT 0.05,
  ADD COLUMN "mittanbudFactor" DECIMAL(6,3) NOT NULL DEFAULT 1.3,
  ADD COLUMN "extraCalloutNok" DECIMAL(10,2),
  ADD COLUMN "tileAllowanceExVat" DECIMAL(10,2),
  ADD COLUMN "electricianCostFactor" DECIMAL(6,4) NOT NULL DEFAULT 1.15,
  ADD COLUMN "assemblyHourlyNok" DECIMAL(10,2);

ALTER TABLE "PriceItem"
  ADD COLUMN "customerText" TEXT,
  ADD COLUMN "splitConfidence" TEXT NOT NULL DEFAULT 'known',
  ADD COLUMN "splitNote" TEXT;

ALTER TABLE "Quote" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Quote" ALTER COLUMN "vatRate" TYPE DECIMAL(6,4);
ALTER TABLE "Quote"
  ADD COLUMN "dealId" TEXT,
  ADD COLUMN "familyId" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN "revision" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Tilbud',
  ADD COLUMN "channelCode" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "customerText" TEXT,
  ADD COLUMN "reservations" TEXT,
  ADD COLUMN "emailSubject" TEXT,
  ADD COLUMN "emailBody" TEXT,
  ADD COLUMN "validDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "sumExVat" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "addonsExVat" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "vatNok" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalIncVat" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "costExVat" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "contributionExVat" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "marginExVat" DECIMAL(8,5) NOT NULL DEFAULT 0,
  ADD COLUMN "hoursTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "hoursByTrade" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "flags" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "QuoteLine" ALTER COLUMN "unitPriceExVat" TYPE DECIMAL(12,4);
ALTER TABLE "QuoteLine"
  ADD COLUMN "tradeCode" TEXT NOT NULL DEFAULT 'annet',
  ADD COLUMN "code" TEXT,
  ADD COLUMN "optional" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "included" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "uncertain" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "uncertaintyNote" TEXT;

ALTER TABLE "ChangeOrder"
  ADD COLUMN "priceListId" TEXT,
  ADD COLUMN "customerText" TEXT,
  ADD COLUMN "assumptions" TEXT,
  ADD COLUMN "sumExVat" DECIMAL(12,2),
  ADD COLUMN "totalIncVat" DECIMAL(12,2),
  ADD COLUMN "marginExVat" DECIMAL(8,5),
  ADD COLUMN "hoursTotal" DECIMAL(10,2),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "portalStatus" TEXT;

CREATE TABLE "QuoteEvent" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChangeOrderLine" (
  "id" TEXT NOT NULL,
  "changeOrderId" TEXT NOT NULL,
  "priceItemId" TEXT,
  "tradeCode" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(12,4) NOT NULL,
  "unitPriceExVat" DECIMAL(12,4) NOT NULL,
  "hours" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "lineSumExVat" DECIMAL(12,2) NOT NULL,
  "rationale" TEXT,
  "uncertain" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "ChangeOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiDraftLog" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT,
  "changeOrderId" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  CONSTRAINT "AiDraftLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TextTemplate" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "tradeCode" TEXT,
  "body" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TextTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'csv',
  "columnMap" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "nobb" TEXT,
  "ean" TEXT,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'stk',
  "costPrice" DECIMAL(12,4),
  "listPrice" DECIMAL(12,4),
  "validFrom" DATE,
  "discontinued" BOOLEAN NOT NULL DEFAULT false,
  "sourceImportId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPriceImport" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPriceImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPriceChange" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "productId" TEXT,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "oldCost" DECIMAL(12,4),
  "newCost" DECIMAL(12,4),
  CONSTRAINT "SupplierPriceChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BomLine" (
  "id" TEXT NOT NULL,
  "priceItemId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "label" TEXT,
  "amountNok" DECIMAL(12,4),
  "productId" TEXT,
  "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
  CONSTRAINT "BomLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceChangeLog" (
  "id" TEXT NOT NULL,
  "priceListId" TEXT NOT NULL,
  "priceItemId" TEXT,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TextTemplate_key_key" ON "TextTemplate"("key");
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");
CREATE UNIQUE INDEX "Product_supplierId_sku_key" ON "Product"("supplierId", "sku");
CREATE INDEX "Product_nobb_idx" ON "Product"("nobb");
CREATE INDEX "Product_ean_idx" ON "Product"("ean");
CREATE INDEX "Quote_projectId_idx" ON "Quote"("projectId");
CREATE INDEX "Quote_dealId_idx" ON "Quote"("dealId");
CREATE INDEX "Quote_familyId_idx" ON "Quote"("familyId");
CREATE INDEX "Quote_status_idx" ON "Quote"("status");
CREATE INDEX "QuoteEvent_quoteId_createdAt_idx" ON "QuoteEvent"("quoteId", "createdAt");
CREATE INDEX "AiDraftLog_quoteId_idx" ON "AiDraftLog"("quoteId");
CREATE INDEX "BomLine_priceItemId_idx" ON "BomLine"("priceItemId");
CREATE INDEX "PriceChangeLog_priceListId_createdAt_idx" ON "PriceChangeLog"("priceListId", "createdAt");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteEvent" ADD CONSTRAINT "QuoteEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiDraftLog" ADD CONSTRAINT "AiDraftLog_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceImport" ADD CONSTRAINT "SupplierPriceImport_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceChange" ADD CONSTRAINT "SupplierPriceChange_importId_fkey" FOREIGN KEY ("importId") REFERENCES "SupplierPriceImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_priceItemId_fkey" FOREIGN KEY ("priceItemId") REFERENCES "PriceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceChangeLog" ADD CONSTRAINT "PriceChangeLog_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
