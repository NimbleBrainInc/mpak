-- Catalog provenance: distinguish rows published to mpak from rows ingested
-- from an upstream registry, and keep the upstream's canonical identity.
ALTER TABLE "packages" ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'mpak';
ALTER TABLE "packages" ADD COLUMN "upstream_name" VARCHAR(255);

CREATE UNIQUE INDEX "packages_upstream_name_key" ON "packages"("upstream_name");

-- Upstream lifecycle state, so a takedown upstream stops the package being
-- served on the next sync. Package-level: "should mpak serve this" is a
-- decision about the package, and it has to be a plain column predicate so
-- every read path gets it without a correlated subquery.
ALTER TABLE "packages" ADD COLUMN "upstream_status" VARCHAR(20);
ALTER TABLE "packages" ADD COLUMN "upstream_updated_at" TIMESTAMP(6);

-- Partial: takedowns are rare, so indexing only the rows the read filter
-- excludes keeps the write cost off every other publish.
CREATE INDEX "idx_packages_upstream_deleted"
    ON "packages"("id")
    WHERE "upstream_status" = 'deleted';

-- One row per ingest run. Holds the incremental watermark transactionally with
-- the rows the run wrote.
CREATE TABLE "registry_syncs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "since" TIMESTAMP(6),
    "watermark" TIMESTAMP(6),
    "servers_seen" INTEGER NOT NULL DEFAULT 0,
    "servers_matched" INTEGER NOT NULL DEFAULT 0,
    "packages_created" INTEGER NOT NULL DEFAULT 0,
    "versions_created" INTEGER NOT NULL DEFAULT 0,
    "artifacts_stored" INTEGER NOT NULL DEFAULT 0,
    "bytes_stored" BIGINT NOT NULL DEFAULT 0,
    "scans_triggered" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "registry_syncs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_registry_syncs_source_status" ON "registry_syncs"("source", "status");
CREATE INDEX "idx_registry_syncs_source_completed" ON "registry_syncs"("source", "completed_at" DESC);
