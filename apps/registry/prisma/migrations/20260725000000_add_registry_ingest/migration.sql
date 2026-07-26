-- Catalog provenance: distinguish rows published to mpak from rows ingested
-- from an upstream registry, and keep the upstream's canonical identity.
ALTER TABLE "packages" ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'mpak';
ALTER TABLE "packages" ADD COLUMN "upstream_name" VARCHAR(255);

CREATE UNIQUE INDEX "packages_upstream_name_key" ON "packages"("upstream_name");
CREATE INDEX "idx_packages_source" ON "packages"("source");

-- Upstream state per version, so a takedown upstream propagates on next sync.
ALTER TABLE "package_versions" ADD COLUMN "upstream_status" VARCHAR(20);
ALTER TABLE "package_versions" ADD COLUMN "upstream_updated_at" TIMESTAMP(6);

-- A pointer-only artifact is catalogued but not mirrored, and therefore not
-- scannable (the scan pod reads S3, never the network).
ALTER TABLE "artifacts" ALTER COLUMN "storage_path" DROP NOT NULL;

-- How much of the bundle the scanner could actually see. Kept separate from
-- certification_level so "we could not look inside" is not reported as a
-- low score earned by inspection.
ALTER TABLE "security_scans" ADD COLUMN "scanability" VARCHAR(20);

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
