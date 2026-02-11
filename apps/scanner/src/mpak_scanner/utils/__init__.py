"""Utility modules for mpak-scanner."""

from mpak_scanner.utils.name_analysis import (
    HALLUCINATION_CORPUS,
    analyze_package_name,
    check_compound_pattern,
    check_similarity_to_corpus,
    check_version_suffix,
    levenshtein_distance,
    normalize_package_name,
)

__all__ = [
    "HALLUCINATION_CORPUS",
    "analyze_package_name",
    "check_compound_pattern",
    "check_similarity_to_corpus",
    "check_version_suffix",
    "levenshtein_distance",
    "normalize_package_name",
]
