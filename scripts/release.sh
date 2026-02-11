#!/usr/bin/env bash
# scripts/release.sh - Version bump, changelog, and tag
#
# Usage:
#   ./scripts/release.sh patch    # 0.1.0 -> 0.1.1
#   ./scripts/release.sh minor    # 0.1.0 -> 0.2.0
#   ./scripts/release.sh major    # 0.1.0 -> 1.0.0
#   ./scripts/release.sh 0.3.0    # Explicit version
#
# This script:
#   1. Validates the working tree is clean
#   2. Bumps version in all package.json files and pyproject.toml
#   3. Updates the Helm chart version
#   4. Creates a git tag
#   5. Prints instructions for pushing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; }

# -- Parse arguments -----------------------------------------------------------

BUMP_TYPE="${1:-}"
if [ -z "$BUMP_TYPE" ]; then
  echo "Usage: $0 <patch|minor|major|x.y.z>"
  exit 1
fi

# -- Validate working tree -----------------------------------------------------

cd "$ROOT_DIR"

if [ -n "$(git status --porcelain)" ]; then
  error "Working tree is not clean. Commit or stash changes first."
  git status --short
  exit 1
fi

# -- Get current version -------------------------------------------------------

CURRENT_VERSION=$(node -p "require('./package.json').version")
info "Current version: $CURRENT_VERSION"

# -- Calculate new version -----------------------------------------------------

if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$BUMP_TYPE"
else
  # Parse semver components
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

  case "$BUMP_TYPE" in
    patch)
      PATCH=$((PATCH + 1))
      ;;
    minor)
      MINOR=$((MINOR + 1))
      PATCH=0
      ;;
    major)
      MAJOR=$((MAJOR + 1))
      MINOR=0
      PATCH=0
      ;;
    *)
      error "Invalid bump type: $BUMP_TYPE (use patch, minor, major, or x.y.z)"
      exit 1
      ;;
  esac

  NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
fi

info "New version: $NEW_VERSION"

# -- Confirm -------------------------------------------------------------------

echo ""
echo -e "  ${YELLOW}$CURRENT_VERSION${NC} -> ${GREEN}$NEW_VERSION${NC}"
echo ""
read -p "Proceed? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  info "Aborted."
  exit 0
fi

# -- Bump versions in package.json files ----------------------------------------

info "Bumping package.json versions..."

# Root package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
ok "root package.json"

# Find all workspace package.json files (excluding node_modules)
for pkg_file in $(find apps packages -name package.json -not -path '*/node_modules/*' -maxdepth 2); do
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$pkg_file', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('$pkg_file', JSON.stringify(pkg, null, 2) + '\n');
  "
  ok "$pkg_file"
done

# -- Bump scanner pyproject.toml -----------------------------------------------

SCANNER_PYPROJECT="$ROOT_DIR/apps/scanner/pyproject.toml"
if [ -f "$SCANNER_PYPROJECT" ]; then
  info "Bumping scanner pyproject.toml..."
  sed -i.bak "s/^version = \".*\"/version = \"$NEW_VERSION\"/" "$SCANNER_PYPROJECT"
  rm -f "${SCANNER_PYPROJECT}.bak"
  ok "apps/scanner/pyproject.toml"
fi

# -- Bump Helm chart version ---------------------------------------------------

CHART_YAML="$ROOT_DIR/deploy/kubernetes/helm/mpak/Chart.yaml"
if [ -f "$CHART_YAML" ]; then
  info "Bumping Helm chart version..."
  sed -i.bak "s/^version: .*/version: $NEW_VERSION/" "$CHART_YAML"
  sed -i.bak "s/^appVersion: .*/appVersion: \"$NEW_VERSION\"/" "$CHART_YAML"
  rm -f "${CHART_YAML}.bak"
  ok "Chart.yaml"
fi

# -- Run tests -----------------------------------------------------------------

info "Running tests to verify release..."
if "$SCRIPT_DIR/test.sh" --ci; then
  ok "All tests passed"
else
  error "Tests failed. Fix issues before releasing."
  # Revert changes
  git checkout .
  exit 1
fi

# -- Git commit and tag --------------------------------------------------------

info "Creating release commit and tag..."

git add -A
git commit -m "release: v$NEW_VERSION"

git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

ok "Created tag v$NEW_VERSION"

# -- Done ----------------------------------------------------------------------

echo ""
echo -e "${GREEN}Release v$NEW_VERSION is ready!${NC}"
echo ""
echo "To publish:"
echo "  git push origin main"
echo "  git push origin v$NEW_VERSION"
echo ""
echo "This will trigger CI/CD to build and publish Docker images."
echo ""
