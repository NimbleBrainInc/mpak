"""Command-line interface for mpak-scanner."""

import json
import logging
import sys
from pathlib import Path

import click

from mpak_scanner import __version__
from mpak_scanner.scanner import scan_bundle


@click.group()
@click.version_option(version=__version__)
@click.option("-v", "--verbose", is_flag=True, help="Enable verbose logging")
def main(verbose: bool) -> None:
    """mpak-scanner: Security scanner for MCP bundles."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


@main.command()
@click.argument("bundle", type=click.Path(exists=True, path_type=Path))
@click.option("--json", "output_json", is_flag=True, help="Output JSON report")
@click.option("--level", type=int, help="Minimum compliance level required (1-4)")
@click.option("--output", "-o", type=click.Path(path_type=Path), help="Output file for report")
def scan(bundle: Path, output_json: bool, level: int | None, output: Path | None) -> None:
    """Scan an MCP bundle for security issues.

    BUNDLE is the path to the .mcpb bundle file to scan.
    """
    click.echo(f"Scanning {bundle}...")

    report = scan_bundle(bundle)

    if output_json:
        report_dict = report.to_dict()
        if output:
            output.write_text(json.dumps(report_dict, indent=2))
            click.echo(f"Report saved to {output}")
        else:
            click.echo(json.dumps(report_dict, indent=2))
    else:
        # Human-readable output
        click.echo()
        click.echo("=" * 60)
        click.echo(f"mpak Security Report: {report.bundle_name}")
        click.echo("=" * 60)
        click.echo(f"Version: {report.bundle_version}")
        click.echo(f"Scanned: {report.scan_timestamp}")
        click.echo(f"Duration: {report.duration_ms}ms")
        click.echo()
        level = report.compliance_level
        click.echo(f"Compliance Level: {level.value} ({level.name_str})")
        click.echo(f"Risk Score: {report.risk_score.value}")
        click.echo(f"Controls: {report.controls_passed}/{report.controls_total} passed")
        click.echo()

        # Show findings by severity
        findings = report.all_findings
        critical = [f for f in findings if f.severity.value == "critical"]
        high = [f for f in findings if f.severity.value == "high"]

        if critical:
            click.echo(click.style("CRITICAL FINDINGS:", fg="red", bold=True))
            for f in critical[:5]:
                click.echo(f"  [{f.control}] {f.title}")
                if f.file:
                    click.echo(f"           File: {f.file}")
            if len(critical) > 5:
                click.echo(f"  ... and {len(critical) - 5} more")
            click.echo()

        if high:
            click.echo(click.style("HIGH FINDINGS:", fg="yellow", bold=True))
            for f in high[:5]:
                click.echo(f"  [{f.control}] {f.title}")
                if f.file:
                    click.echo(f"           File: {f.file}")
            if len(high) > 5:
                click.echo(f"  ... and {len(high) - 5} more")
            click.echo()

        click.echo("=" * 60)

        # Save JSON report alongside bundle
        if not output:
            json_path = bundle.with_suffix(".security-report.json")
            json_path.write_text(json.dumps(report.to_dict(), indent=2))
            click.echo(f"Full report saved to: {json_path}")

    # Exit with appropriate code
    if level is not None and report.compliance_level.value < level:
        click.echo(
            click.style(
                f"FAIL: Bundle does not meet minimum compliance level {level}",
                fg="red",
            )
        )
        sys.exit(1)

    if report.risk_score.value in ("CRITICAL", "HIGH"):
        sys.exit(1)

    sys.exit(0)


@main.command()
def job():
    """Run as a K8s Job (reads config from environment variables)."""
    from mpak_scanner.job import run_job

    run_job()


if __name__ == "__main__":
    main()
