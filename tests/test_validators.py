import os

import pytest

from app.errors import UnsupportedFormatError, ValidationError
from app.validators import safe_join_within, validate_extension, validate_file_size


def test_validate_extension_accepts_allowed():
    validate_extension("photo.JPG", {"jpg", "jpeg", "png"})


def test_validate_extension_rejects_disallowed():
    with pytest.raises(UnsupportedFormatError):
        validate_extension("document.pdf", {"jpg", "jpeg", "png"})


def test_validate_extension_rejects_missing_extension():
    with pytest.raises(ValidationError):
        validate_extension("no_extension", {"jpg"})


def test_validate_extension_rejects_empty_filename():
    with pytest.raises(ValidationError):
        validate_extension("", {"jpg"})


def test_validate_file_size_rejects_empty():
    with pytest.raises(ValidationError):
        validate_file_size(b"", max_bytes=1000)


def test_validate_file_size_rejects_oversized():
    with pytest.raises(ValidationError):
        validate_file_size(b"x" * 2000, max_bytes=1000)


def test_validate_file_size_accepts_within_limit():
    validate_file_size(b"x" * 500, max_bytes=1000)


def test_safe_join_within_allows_normal_subpath(tmp_path):
    base = str(tmp_path)
    result = safe_join_within(base, "subdir", "file.txt")
    assert result.startswith(os.path.normpath(base))


@pytest.mark.parametrize("traversal", ["..", "../..", "../../etc/passwd", "a/../../b"])
def test_safe_join_within_rejects_traversal(tmp_path, traversal):
    with pytest.raises(ValidationError):
        safe_join_within(str(tmp_path), traversal)


def test_safe_join_within_rejects_sibling_prefix_bypass(tmp_path):
    # Regression test: a naive `candidate.startswith(base)` check would incorrectly allow a
    # sibling directory that merely shares base_dir's string prefix, e.g. base "imageapp" vs
    # "imageapp_evil" — commonpath() is required to reject this correctly.
    base = str(tmp_path / "imageapp")
    os.makedirs(base, exist_ok=True)
    sibling = str(tmp_path / "imageapp_evil")
    os.makedirs(sibling, exist_ok=True)
    with pytest.raises(ValidationError):
        safe_join_within(base, "..", "imageapp_evil")
