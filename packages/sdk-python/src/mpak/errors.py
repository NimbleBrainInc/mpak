"""Error hierarchy for the mpak SDK."""


class MpakError(Exception):
    """Base error for all mpak SDK errors."""

    def __init__(self, message: str, code: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class MpakNotFoundError(MpakError):
    """Resource not found (404)."""

    def __init__(self, resource: str):
        super().__init__(f"Resource not found: {resource}", "NOT_FOUND", 404)
        self.resource = resource


class MpakIntegrityError(MpakError):
    """SHA256 hash mismatch. Fail-closed: content is NOT returned."""

    def __init__(self, expected: str, actual: str):
        super().__init__(
            f"Integrity mismatch: expected {expected}, got {actual}",
            "INTEGRITY_MISMATCH",
        )
        self.expected = expected
        self.actual = actual


class MpakNetworkError(MpakError):
    """Network failure (timeout, connection error)."""

    def __init__(self, message: str):
        super().__init__(message, "NETWORK_ERROR")
