.PHONY: test lint format build clean

test:
	uv run pytest

lint:
	uv run ruff check src/ tests/
	uv run ruff format --check src/ tests/
	uv run ty check src/

format:
	uv run ruff check --fix src/ tests/
	uv run ruff format src/ tests/

build:
	uv run python -m build

clean:
	rm -rf build/ dist/ *.egg-info .pytest_cache .ruff_cache htmlcov .coverage
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
