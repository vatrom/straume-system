ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'text_short';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'multi';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'date';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'media';

ALTER TABLE "ChecklistItem" ADD COLUMN "itemKey" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN "config" JSONB;
