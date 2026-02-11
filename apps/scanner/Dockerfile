FROM python:3.13-slim

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

# TruffleHog (secret detection)
RUN curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin

# ESLint with security plugin (JS/TS static analysis)
RUN npm install -g eslint eslint-plugin-security --no-fund --no-audit

# mpak-scanner + Python security tools (bandit, guarddog)
RUN pip install --no-cache-dir "mpak-scanner[job]==0.2.3" bandit guarddog

ENTRYPOINT ["mpak-scanner"]
CMD ["job"]
