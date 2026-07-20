FROM python:3.13-slim
ARG SCANNER_VERSION=0.2.7

# Analysis tools are pinned. This image is rebuilt on a schedule to refresh the
# baked vulnerability database, so anything unpinned would silently re-resolve
# every night -- and a tool's behaviour changing under an unattended rebuild is
# how a working scanner becomes a quietly broken one. Bump these deliberately.
ARG SYFT_VERSION=v1.48.0
ARG GRYPE_VERSION=v0.116.0
ARG TRUFFLEHOG_VERSION=v3.95.9
ARG BANDIT_VERSION=1.9.4
ARG GUARDDOG_VERSION=3.1.0
ARG ESLINT_VERSION=10.7.0
ARG ESLINT_PLUGIN_SECURITY_VERSION=4.0.1

# System deps for external security tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Anchore tools: syft (SBOM), grype (CVE scanning)
RUN curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin "${SYFT_VERSION}" && \
    curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin "${GRYPE_VERSION}"

# Bake the grype vulnerability database into the image. grype's default cache
# lives under $HOME, which is unwritable for the scan job's non-root user, so
# without this it can never hold a database and every CVE scan fails.
#
# The directory is owned by uid 1000 to match runAsUser in the scan Job's pod
# spec (see createScanJob in the registry). grype refuses a database older than
# max-allowed-built-age (5 days) and updates in place, creating temp dirs inside
# the cache -- so read-only ownership would strand every scan once the baked
# database aged out. Owning it by the runtime user keeps auto-update working and
# leaves the baked copy as the offline fallback.
ENV GRYPE_DB_CACHE_DIR=/opt/grype-db
RUN grype db update && grype db status && chown -R 1000:1000 /opt/grype-db

# TruffleHog (secret detection)
RUN curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin "${TRUFFLEHOG_VERSION}"

# ESLint with security plugin (JS/TS static analysis).
# NODE_PATH lets ESLint resolve the globally installed plugin while analysing
# files outside any node_modules tree -- it is run with --no-config-lookup and
# absolute paths, never from inside the bundle.
ENV NODE_PATH=/usr/local/lib/node_modules
RUN npm install -g "eslint@${ESLINT_VERSION}" "eslint-plugin-security@${ESLINT_PLUGIN_SECURITY_VERSION}" --no-fund --no-audit

# mpak-scanner + Python security tools (bandit, guarddog)
RUN pip install --no-cache-dir "mpak-scanner[job]==${SCANNER_VERSION}" \
    "bandit==${BANDIT_VERSION}" "guarddog==${GUARDDOG_VERSION}"

# GuardDog refreshes a typosquatting corpus by writing back into its own package
# directory, which the scan job's non-root user cannot do -- it dies with
# PermissionError before analysing anything. Same shape as the grype cache
# above. Own the resource directory by the runtime uid so the refresh succeeds.
RUN GUARDDOG_RESOURCES="$(python -c 'import guarddog, pathlib; print(pathlib.Path(guarddog.__file__).parent / "analyzer" / "metadata" / "resources")')" && \
    test -d "$GUARDDOG_RESOURCES" && \
    chown -R 1000:1000 "$GUARDDOG_RESOURCES"

ENTRYPOINT ["mpak-scanner"]
CMD ["job"]
