-- Hide a Tripletex employee the user took out of planning, without letting sync recreate them.
ALTER TABLE "Resource" ADD COLUMN "planExcluded" BOOLEAN NOT NULL DEFAULT false;

-- Closed Tripletex projects stay in the database, but leave the plan.
ALTER TABLE "Project" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

-- User-deleted Tripletex projects. Sync must not bring them back.
ALTER TABLE "Project" ADD COLUMN "syncIgnored" BOOLEAN NOT NULL DEFAULT false;
