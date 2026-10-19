-- Engangskorrigering av «Befaring avtalt». Pipedrive hadde 100 %. Vidar satte 40 %.
-- Rader som allerede har en annen sannsynlighet, er endret av admin og blir stående.

UPDATE "Stage"
SET probability = 40, "rottenDays" = 14
WHERE name = 'Befaring avtalt' AND probability = 100;

-- Fyll bare tomme demo-felt én gang. Senere tømming fra kontoret blir stående.
UPDATE "ProjectPhase"
SET "rottenDays" = 21
WHERE id = '21000000-0000-4000-8000-000000000001' AND "rottenDays" IS NULL;

UPDATE "Project"
SET "plannedEndDate" = DATE '2026-10-01', "phaseEnteredAt" = TIMESTAMP '2026-09-01 12:00:00+00'
WHERE id = '60000000-0000-4000-8000-000000000002' AND "plannedEndDate" IS NULL;
