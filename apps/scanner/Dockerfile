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

# Bake the grype vulnerability database into the image. Without it, every scan
# job downloads the full database at runtime, and a restricted-egress or
# rate-limited job leaves grype with no database at all. Auto-update stays on,
# so a job with network access still refreshes to the latest.
ENV GRYPE_DB_CACHE_DIR=/opt/grype-db
RUN grype db update && grype db status && chmod -R a+rX /opt/grype-db

# TruffleHog (secret detection)
RUN curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin

# ESLint with security plugin (JS/TS static analysis)
RUN npm install -g eslint eslint-plugin-security --no-fund --no-audit

# mpak-scanner + Python security tools (bandit, guarddog)
RUN pip install --no-cache-dir "mpak-scanner[job]==${SCANNER_VERSION}" bandit guarddog

ENTRYPOINT ["mpak-scanner"]
CMD ["job"]
