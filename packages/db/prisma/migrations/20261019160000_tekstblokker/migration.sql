ALTER TABLE "Quote" ADD COLUMN "aiSuggestion" TEXT;

CREATE TABLE "TextBlockSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TextBlockSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TextBlockVersion" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TextBlockVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TextBlock" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "includeWhen" JSONB NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "aiSelectable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TextBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TextBlockVersion_setId_version_key" ON "TextBlockVersion"("setId", "version");

CREATE UNIQUE INDEX "TextBlock_versionId_key_key" ON "TextBlock"("versionId", "key");

CREATE INDEX "TextBlock_versionId_sortOrder_idx" ON "TextBlock"("versionId", "sortOrder");

ALTER TABLE "TextBlockVersion" ADD CONSTRAINT "TextBlockVersion_setId_fkey" FOREIGN KEY ("setId") REFERENCES "TextBlockSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TextBlock" ADD CONSTRAINT "TextBlock_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TextBlockVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
