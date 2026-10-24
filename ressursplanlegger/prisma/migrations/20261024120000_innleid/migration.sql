-- Innleid personell. Existing rows stay own employees.
ALTER TABLE "Resource" ADD COLUMN "innleid" BOOLEAN NOT NULL DEFAULT false;
