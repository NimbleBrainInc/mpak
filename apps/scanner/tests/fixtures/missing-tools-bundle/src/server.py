"""TEST FIXTURE: Server with poorly declared tools.

The manifest.json for this bundle has tools that:
- Missing description field (triggers MEDIUM severity)
- Generic name like "run" (triggers LOW severity warning)
- Missing name field entirely (triggers MEDIUM severity)

This tests the CD-01 (Tool Declaration) control.
"""


def do_something() -> str:
    """This tool has no description in manifest."""
    return "done"


def run() -> str:
    """This tool has a generic name."""
    return "running"


if __name__ == "__main__":
    pass
