"""CLI entry point for loading MCPB bundles.

This module provides the mpak-loader command, which is a drop-in replacement
for the standalone mcpb-loader.py script used in container images.

Usage:
    mpak-loader @scope/name /dest/dir
    mpak-loader @scope/name@1.2.3 /dest/dir
    mpak-loader https://example.com/bundle.mcpb /dest/dir [sha256]
"""

import json
import sys

from mpak.client import MpakClient


def main():
    """Main entry point for mpak-loader CLI."""
    if len(sys.argv) < 3:
        print("Usage: mpak-loader <bundle_url_or_package> <dest_dir> [expected_sha256]", file=sys.stderr)
        sys.exit(1)

    try:
        source = sys.argv[1]
        dest = sys.argv[2]
        expected_sha256 = sys.argv[3] if len(sys.argv) > 3 else None

        client = MpakClient()

        # If source looks like an mpak package name (@scope/name), resolve via registry
        if source.startswith("@"):
            version = "latest"
            if "@" in source[1:]:
                # @scope/name@version
                source, version = source.rsplit("@", 1)

            # Resolve and download from registry
            print(f"Resolving {source}@{version}...")
            manifest = client.load_bundle(source, dest, version=version)
        else:
            # Direct URL download
            manifest = client.load_bundle_from_url(source, dest, expected_sha256)

        # Write manifest to stdout for entrypoint to use
        print(json.dumps(manifest))
        sys.exit(0)

    except Exception as e:
        print(f"Error loading bundle: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
