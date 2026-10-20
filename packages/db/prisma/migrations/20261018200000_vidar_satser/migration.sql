-- Vidars satser: elektriker 1 150, felles oppmøte 490, flis 400, kilde uten faktor 1,3

ALTER TABLE "Trade" ADD COLUMN "subcontractor" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Trade" SET "subcontractor" = true WHERE "code" = 'elektriker';

ALTER TABLE "TradeRate" ALTER COLUMN "calloutPrice" DROP NOT NULL;
UPDATE "TradeRate" SET "calloutPrice" = NULL;

ALTER TABLE "PriceList" ALTER COLUMN "byggstartPercent" SET DEFAULT 0.08;
ALTER TABLE "PriceList" ALTER COLUMN "byggstartFactor" SET DEFAULT 1;
ALTER TABLE "PriceList" ALTER COLUMN "mittanbudFactor" SET DEFAULT 1;

UPDATE "PriceList"
SET
  "byggstartPercent" = 0.08,
  "byggstartFactor" = 1,
  "mittanbudFactor" = 1,
  "extraCalloutNok" = 490,
  "tileAllowanceExVat" = 400
WHERE "byggstartFactor" = 1.3 OR "extraCalloutNok" IS NULL;

UPDATE "TradeRate" AS rate
SET "hourlyRateSale" = 1150
FROM "Trade" AS trade
WHERE rate."tradeId" = trade.id
  AND trade.code = 'elektriker'
  AND rate."hourlyRateSale" = 1190;

UPDATE "PriceLine" AS line
SET
  "hoursPerUnit" = 0,
  "hourlyRateOverride" = NULL,
  "salePriceOverride" = CASE
    WHEN item.type = 'hours' AND (line."salePriceOverride" IS NULL OR line."salePriceOverride" = 1190) THEN 1150
    WHEN line."salePriceOverride" = 1190 THEN 1150
    ELSE line."salePriceOverride"
  END
FROM "PriceItem" AS item
WHERE line."priceItemId" = item.id
  AND item."tradeId" = 'elektriker'
  AND item.type NOT IN ('freetext', 'percent_addon', 'callout');

UPDATE "PriceItem"
SET
  "splitConfidence" = 'known',
  "splitNote" = 'Underleverandør. Fast salgspris uten egne timer.'
WHERE "tradeId" = 'elektriker'
  AND type NOT IN ('freetext', 'percent_addon', 'callout');

UPDATE "PriceLine" AS line
SET "salePriceOverride" = 490
FROM "PriceItem" AS item
WHERE line."priceItemId" = item.id
  AND item.type = 'callout'
  AND line."salePriceOverride" IN (450, 500, 550);

UPDATE "PriceItem"
SET
  "splitConfidence" = 'known',
  "splitNote" = 'Oppmøte bruker felles sats, med mindre faget har en overstyring.'
WHERE type = 'callout';

UPDATE "Deal" SET "sourceChannel" = 'MittAnbud XL' WHERE "sourceChannel" ILIKE 'mittanbud xl';
UPDATE "OptionItem" SET "label" = 'MittAnbud XL' WHERE "label" ILIKE 'mittanbud xl' AND "label" <> 'MittAnbud XL';
