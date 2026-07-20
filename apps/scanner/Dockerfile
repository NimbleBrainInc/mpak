FROM python:3.13-slim
ARG SCANNER_VERSION=0.2.7

# System deps for external security tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Anchore tools: syft (SBOM), grype (CVE scanning)
RUN curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin && \
    curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin

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
RUN curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin

# ESLint with security plugin (JS/TS static analysis)
RUN npm install -g eslint eslint-plugin-security --no-fund --no-audit

# mpak-scanner + Python security tools (bandit, guarddog)
RUN pip install --no-cache-dir "mpak-scanner[job]==${SCANNER_VERSION}" bandit guarddog

ENTRYPOINT ["mpak-scanner"]
CMD ["job"]
