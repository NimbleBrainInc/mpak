"""K8s Job mode for mpak-scanner.

Downloads a bundle from S3, scans it, uploads the report, and calls back
to the mpak-api with results. All configuration comes from environment
variables set by the Job spec.
"""

import json
import logging
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

from mpak_scanner.scanner import scan_bundle

logger = logging.getLogger(__name__)

REQUIRED_ENV = [
    "BUNDLE_S3_BUCKET",
    "BUNDLE_S3_KEY",
    "SCAN_ID",
    "CALLBACK_URL",
    "RESULT_S3_BUCKET",
    "RESULT_S3_PREFIX",
]


def _get_env(name: str) -> str:
    """Get a required environment variable or exit with a clear error."""
    value = os.environ.get(name, "")
    if not value:
        logger.error("Required environment variable %s is not set", name)
        sys.exit(1)
    return value


def run_job() -> None:
    """Run the scanner as a K8s Job."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # 1. Read env vars (fail fast)
    env = {name: _get_env(name) for name in REQUIRED_ENV}
    callback_secret = os.environ.get("CALLBACK_SECRET", "")
    region = os.environ.get("AWS_REGION", "us-east-1")

    scan_id = env["SCAN_ID"]
    callback_url = env["CALLBACK_URL"]
    result_bucket = env["RESULT_S3_BUCKET"]
    result_prefix = env["RESULT_S3_PREFIX"]

    logger.info("Starting scan job %s for %s", scan_id, env["BUNDLE_S3_KEY"])

    try:
        import boto3  # type: ignore[unresolved-import]

        s3 = boto3.client("s3", region_name=region)

        # 2. Download bundle from S3
        with tempfile.TemporaryDirectory(prefix="mpak-job-") as tmp:
            bundle_filename = Path(env["BUNDLE_S3_KEY"]).name
            local_path = Path(tmp) / bundle_filename

            logger.info("Downloading s3://%s/%s", env["BUNDLE_S3_BUCKET"], env["BUNDLE_S3_KEY"])
            s3.download_file(env["BUNDLE_S3_BUCKET"], env["BUNDLE_S3_KEY"], str(local_path))

            # 3. Scan the bundle
            logger.info("Scanning %s", local_path.name)
            report = scan_bundle(local_path)

            # 4. Prepare report
            report_dict = report.to_dict()
            report_json = json.dumps(report_dict, indent=2).encode()

            # 5. Upload report to S3
            report_key = f"{result_prefix}{scan_id}/report.json"
            report_s3_uri = f"s3://{result_bucket}/{report_key}"

            logger.info("Uploading report to %s", report_s3_uri)
            s3.put_object(
                Bucket=result_bucket,
                Key=report_key,
                Body=report_json,
                ContentType="application/json",
            )

            # 6. POST callback
            callback_body = json.dumps(
                {
                    "scan_id": scan_id,
                    "status": "completed",
                    "risk_score": report.risk_score.value,
                    "report": report_dict,
                    "report_s3_uri": report_s3_uri,
                }
            ).encode()

            logger.info("Sending callback to %s", callback_url)
            req = urllib.request.Request(  # noqa: S310
                callback_url,
                data=callback_body,
                headers={
                    "Content-Type": "application/json",
                    "X-Callback-Secret": callback_secret,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
                logger.info("Callback response: %s", resp.status)

        logger.info("Scan job %s completed successfully", scan_id)

    except Exception as e:
        logger.exception("Scan job %s failed: %s", scan_id, e)

        # Attempt to send failure callback
        try:
            failure_body = json.dumps(
                {
                    "scan_id": scan_id,
                    "status": "failed",
                    "error": str(e),
                }
            ).encode()

            req = urllib.request.Request(  # noqa: S310
                callback_url,
                data=failure_body,
                headers={
                    "Content-Type": "application/json",
                    "X-Callback-Secret": callback_secret,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
                logger.info("Failure callback response: %s", resp.status)
        except Exception as cb_err:
            logger.error("Failed to send failure callback: %s", cb_err)

        sys.exit(1)
