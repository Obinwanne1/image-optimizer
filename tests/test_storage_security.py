import os

import pytest

from app.errors import SessionNotFoundError
from app.storage import SessionStore

# Regression tests for a path-traversal bug: image_id came straight from a URL path segment
# and was joined onto temp_dir with no format check, including on a path fed to
# shutil.rmtree() in delete_session(). An id like ".." resolves to temp_dir's *parent* --
# verified directly: os.path.join(temp_dir, "..") == os.path.dirname(temp_dir) -- so an
# unauthenticated request could have deleted far more than one session's directory.

TRAVERSAL_IDS = ["..", "../..", "../../etc", ".", "", "not-a-uuid", "a" * 31, "a" * 33, "AAAA" * 8]


@pytest.fixture
def store(temp_store_dir):
    return SessionStore(temp_dir=temp_store_dir, ttl_seconds=60)


@pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
def test_delete_session_rejects_malformed_ids(store, bad_id):
    with pytest.raises(SessionNotFoundError):
        store.delete_session(bad_id)


@pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
def test_get_info_rejects_malformed_ids(store, bad_id):
    with pytest.raises(SessionNotFoundError):
        store.get_info(bad_id)


def test_delete_session_with_traversal_id_does_not_touch_parent_dir(store, temp_store_dir):
    parent = os.path.dirname(os.path.normpath(temp_store_dir))
    marker = os.path.join(parent, "sentinel_should_survive.txt")
    with open(marker, "w") as f:
        f.write("still here")
    try:
        with pytest.raises(SessionNotFoundError):
            store.delete_session("..")
        assert os.path.exists(marker), "traversal id must not reach the real filesystem join"
        assert os.path.isdir(temp_store_dir), "the store's own temp dir must survive too"
    finally:
        os.remove(marker)


def test_create_then_get_then_delete_round_trip(store, rgb_png_bytes):
    image_id = store.create_session(rgb_png_bytes, "photo.png")
    info = store.get_info(image_id)
    assert info["width"] == 100
    assert info["height"] == 80
    assert info["format"] == "PNG"

    store.delete_session(image_id)
    with pytest.raises(SessionNotFoundError):
        store.get_info(image_id)


def test_delete_session_on_valid_shaped_but_unknown_id_is_a_clean_noop(store):
    # A well-formed id that was never created should behave like "nothing to delete",
    # not raise -- delete_session doesn't require the session to currently exist.
    store.delete_session("0" * 32)
