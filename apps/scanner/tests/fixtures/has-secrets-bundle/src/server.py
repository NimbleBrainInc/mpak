"""TEST FIXTURE: Server with intentional embedded secrets.

WARNING: This file contains FAKE test secrets for security scanner validation.
These are NOT real credentials - they are formatted to trigger secret detection.

DO NOT use these values anywhere. They exist solely to test CQ-01 control.
"""

# TEST SECRET: Fake AWS credentials (format matches real keys)
# These are intentionally embedded to test secret detection
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

# TEST SECRET: Fake GitHub token
GITHUB_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# TEST SECRET: Fake database connection string
DATABASE_URL = "postgresql://admin:supersecretpassword123@db.example.com:5432/prod"


def get_data(query: str) -> str:
    """Fetch data using hardcoded credentials (intentionally bad practice)."""
    # This would be a security vulnerability in real code
    return f"Query: {query}"


if __name__ == "__main__":
    print("This is a test fixture with embedded secrets")
