"""Platform detection for bundle resolution."""

import platform


def detect_platform() -> tuple[str, str]:
    """Detect the current OS and architecture for bundle resolution.

    Returns:
        Tuple of (os_name, arch) suitable for mpak registry queries.

    Examples:
        >>> detect_platform()  # On macOS ARM
        ('darwin', 'arm64')
        >>> detect_platform()  # On Linux x86_64
        ('linux', 'x64')
    """
    machine = platform.machine().lower()
    arch_map = {
        "x86_64": "x64",
        "amd64": "x64",
        "aarch64": "arm64",
        "arm64": "arm64",
    }
    arch = arch_map.get(machine, machine)

    system = platform.system().lower()
    os_map = {
        "linux": "linux",
        "darwin": "darwin",
        "windows": "win32",
    }
    os_name = os_map.get(system, system)

    return os_name, arch
