"""TEST FIXTURE: Server with vulnerable dependencies.

This bundle intentionally depends on packages with known CVEs:
- urllib3 1.26.4 (CVE-2021-33503)
- py 1.10.0 (CVE-2022-42969)
- celery 5.0.0 (CVE-2021-23727)
- future 0.18.2 (CVE-2022-40899)

This tests the SC-02 (Vulnerability Scan) control.
"""


def process(data: str) -> str:
    """Process data (would use vulnerable deps in real code)."""
    return f"Processed: {data}"


if __name__ == "__main__":
    pass
