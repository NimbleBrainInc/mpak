"""SHA256 integrity verification."""

import hashlib
from pathlib import Path

from mpak.errors import MpakIntegrityError


def compute_sha256(file_path: Path) -> str:
    """Compute SHA256 hash of a file.

    Args:
        file_path: Path to the file to hash

    Returns:
        Lowercase hexadecimal SHA256 hash
    """
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def compute_sha256_bytes(data: bytes) -> str:
    """Compute SHA256 hash of byte data.

    Args:
        data: Bytes to hash

    Returns:
        Lowercase hexadecimal SHA256 hash
    """
    return hashlib.sha256(data).hexdigest()


def verify_integrity(file_path: Path, expected_sha256: str) -> None:
    """Verify file integrity against expected SHA256 hash.

    This is fail-closed: raises MpakIntegrityError on mismatch.
    The file is NOT deleted on mismatch (caller should handle cleanup).

    Args:
        file_path: Path to file to verify
        expected_sha256: Expected SHA256 hash (case-insensitive)

    Raises:
        MpakIntegrityError: If hash does not match expected value
    """
    actual_sha256 = compute_sha256(file_path)
    if actual_sha256.lower() != expected_sha256.lower():
        raise MpakIntegrityError(expected=expected_sha256, actual=actual_sha256)


def verify_integrity_bytes(data: bytes, expected_sha256: str) -> None:
    """Verify byte data integrity against expected SHA256 hash.

    This is fail-closed: raises MpakIntegrityError on mismatch.

    Args:
        data: Bytes to verify
        expected_sha256: Expected SHA256 hash (case-insensitive)

    Raises:
        MpakIntegrityError: If hash does not match expected value
    """
    actual_sha256 = compute_sha256_bytes(data)
    if actual_sha256.lower() != expected_sha256.lower():
        raise MpakIntegrityError(expected=expected_sha256, actual=actual_sha256)
