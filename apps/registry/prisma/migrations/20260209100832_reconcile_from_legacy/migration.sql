-- Reconcile from legacy mpak schema
-- This migration is safe to run on BOTH fresh databases (after init) and legacy databases.
-- It uses IF NOT EXISTS so columns that already exist are skipped.

-- package_versions: add server_json (new in mpak-new, not in legacy)
ALTER TABLE "package_versions" ADD COLUMN IF NOT EXISTS "server_json" JSONB;

-- security_scans: add MTF certification fields (added late in legacy, may be missing on some envs)
ALTER TABLE "security_scans" ADD COLUMN IF NOT EXISTS "certification_level" INTEGER;
ALTER TABLE "security_scans" ADD COLUMN IF NOT EXISTS "controls_passed" INTEGER;
ALTER TABLE "security_scans" ADD COLUMN IF NOT EXISTS "controls_failed" INTEGER;
ALTER TABLE "security_scans" ADD COLUMN IF NOT EXISTS "controls_total" INTEGER;
ALTER TABLE "security_scans" ADD COLUMN IF NOT EXISTS "findings_summary" JSONB;

-- Ensure certification index exists
CREATE INDEX IF NOT EXISTS "idx_security_scans_certification_level" ON "security_scans"("certification_level");
