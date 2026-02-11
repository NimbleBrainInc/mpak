-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255),
    "name" VARCHAR(255),
    "avatar_url" VARCHAR(512),
    "github_username" VARCHAR(255),
    "github_user_id" VARCHAR(255),
    "email_verified" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "description" TEXT,
    "author_name" VARCHAR(255),
    "author_email" VARCHAR(255),
    "author_url" VARCHAR(512),
    "homepage" VARCHAR(512),
    "license" VARCHAR(100),
    "icon_url" VARCHAR(512),
    "server_type" VARCHAR(50) NOT NULL,
    "verified" BOOLEAN DEFAULT false,
    "latest_version" VARCHAR(50) NOT NULL,
    "total_downloads" BIGINT DEFAULT 0,
    "created_by" UUID,
    "github_repo" VARCHAR(512),
    "claimed_by" UUID,
    "claimed_at" TIMESTAMP(6),
    "github_stars" INTEGER,
    "github_forks" INTEGER,
    "github_watchers" INTEGER,
    "github_updated_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "package_id" UUID NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "manifest" JSONB NOT NULL,
    "prerelease" BOOLEAN NOT NULL DEFAULT false,
    "download_count" BIGINT DEFAULT 0,
    "published_by" UUID,
    "published_by_email" VARCHAR(255),
    "published_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "release_tag" VARCHAR(100),
    "release_url" VARCHAR(512),
    "source_index" JSONB,
    "readme" TEXT,
    "publish_method" VARCHAR(20),
    "provenance_repository" VARCHAR(255),
    "provenance_sha" VARCHAR(64),
    "provenance" JSONB,

    CONSTRAINT "package_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "license" VARCHAR(100),
    "compatibility" VARCHAR(500),
    "allowed_tools" TEXT,
    "category" VARCHAR(50),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "triggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "author_name" VARCHAR(255),
    "author_email" VARCHAR(255),
    "author_url" VARCHAR(512),
    "github_repo" VARCHAR(512),
    "latest_version" VARCHAR(50) NOT NULL,
    "total_downloads" BIGINT DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "skill_id" UUID NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "frontmatter" JSONB NOT NULL,
    "prerelease" BOOLEAN NOT NULL DEFAULT false,
    "download_count" BIGINT DEFAULT 0,
    "published_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "release_tag" VARCHAR(100),
    "release_url" VARCHAR(512),
    "storage_path" VARCHAR(512) NOT NULL,
    "source_url" VARCHAR(512),
    "digest" VARCHAR(71) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "publish_method" VARCHAR(20),
    "provenance_repository" VARCHAR(255),
    "provenance_sha" VARCHAR(64),
    "provenance" JSONB,

    CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "os" VARCHAR(20) NOT NULL,
    "arch" VARCHAR(20) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL DEFAULT 'application/vnd.mcp.bundle.v0.3+gzip',
    "digest" VARCHAR(71) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_path" VARCHAR(512) NOT NULL,
    "source_url" VARCHAR(512) NOT NULL,
    "download_count" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_scans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "scan_id" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "risk_score" VARCHAR(20),
    "report_s3_uri" VARCHAR(512),
    "pdf_s3_uri" VARCHAR(512),
    "report" JSONB,
    "error" TEXT,
    "job_name" VARCHAR(255),
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),
    "certification_level" INTEGER,
    "controls_passed" INTEGER,
    "controls_failed" INTEGER,
    "controls_total" INTEGER,
    "findings_summary" JSONB,

    CONSTRAINT "security_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_users_clerk_id" ON "users"("clerk_id");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_username" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_users_github_username" ON "users"("github_username");

-- CreateIndex
CREATE UNIQUE INDEX "packages_name_key" ON "packages"("name");

-- CreateIndex
CREATE INDEX "idx_packages_name" ON "packages"("name");

-- CreateIndex
CREATE INDEX "idx_packages_created_by" ON "packages"("created_by");

-- CreateIndex
CREATE INDEX "idx_packages_claimed_by" ON "packages"("claimed_by");

-- CreateIndex
CREATE INDEX "idx_packages_server_type" ON "packages"("server_type");

-- CreateIndex
CREATE INDEX "idx_packages_verified" ON "packages"("verified");

-- CreateIndex
CREATE INDEX "idx_packages_downloads" ON "packages"("total_downloads" DESC);

-- CreateIndex
CREATE INDEX "idx_packages_created_at" ON "packages"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_package_versions_package_id" ON "package_versions"("package_id");

-- CreateIndex
CREATE INDEX "idx_package_versions_prerelease" ON "package_versions"("package_id", "prerelease");

-- CreateIndex
CREATE INDEX "idx_package_versions_publish_method" ON "package_versions"("publish_method");

-- CreateIndex
CREATE INDEX "idx_package_versions_provenance_repo" ON "package_versions"("provenance_repository");

-- CreateIndex
CREATE INDEX "idx_package_versions_provenance_sha" ON "package_versions"("provenance_sha");

-- CreateIndex
CREATE UNIQUE INDEX "package_versions_package_id_version_key" ON "package_versions"("package_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "idx_skills_name" ON "skills"("name");

-- CreateIndex
CREATE INDEX "idx_skills_category" ON "skills"("category");

-- CreateIndex
CREATE INDEX "idx_skills_downloads" ON "skills"("total_downloads" DESC);

-- CreateIndex
CREATE INDEX "idx_skills_created_at" ON "skills"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_skill_versions_skill_id" ON "skill_versions"("skill_id");

-- CreateIndex
CREATE INDEX "idx_skill_versions_publish_method" ON "skill_versions"("publish_method");

-- CreateIndex
CREATE INDEX "idx_skill_versions_provenance_repo" ON "skill_versions"("provenance_repository");

-- CreateIndex
CREATE UNIQUE INDEX "skill_versions_skill_id_version_key" ON "skill_versions"("skill_id", "version");

-- CreateIndex
CREATE INDEX "idx_artifacts_version_id" ON "artifacts"("version_id");

-- CreateIndex
CREATE INDEX "idx_artifacts_platform" ON "artifacts"("os", "arch");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_version_id_os_arch_key" ON "artifacts"("version_id", "os", "arch");

-- CreateIndex
CREATE UNIQUE INDEX "security_scans_scan_id_key" ON "security_scans"("scan_id");

-- CreateIndex
CREATE INDEX "idx_security_scans_version_id" ON "security_scans"("version_id");

-- CreateIndex
CREATE INDEX "idx_security_scans_scan_id" ON "security_scans"("scan_id");

-- CreateIndex
CREATE INDEX "idx_security_scans_status" ON "security_scans"("status");

-- CreateIndex
CREATE INDEX "idx_security_scans_certification_level" ON "security_scans"("certification_level");

-- AddForeignKey
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "package_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "package_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
