import io
import os
import shutil
import tempfile

import pytest
from PIL import Image


def make_image_bytes(width=100, height=80, mode="RGB", fmt="PNG", color=(200, 60, 60)):
    img = Image.new(mode, (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def rgb_png_bytes():
    return make_image_bytes(mode="RGB", fmt="PNG")


@pytest.fixture
def rgba_png_bytes():
    return make_image_bytes(mode="RGBA", fmt="PNG", color=(10, 200, 10, 128))


@pytest.fixture
def jpeg_bytes():
    return make_image_bytes(mode="RGB", fmt="JPEG")


@pytest.fixture
def temp_store_dir():
    """A throwaway directory for SessionStore tests, isolated from the real
    IMAGEAPP_TEMP_DIR and cleaned up afterward regardless of what the test does to it."""
    path = tempfile.mkdtemp(prefix="imageapp_test_")
    yield path
    shutil.rmtree(path, ignore_errors=True)


@pytest.fixture
def app():
    from app import create_app
    from app.config import Config

    class TestConfig(Config):
        TEMP_DIR = tempfile.mkdtemp(prefix="imageapp_test_app_")
        LOG_DIR = tempfile.mkdtemp(prefix="imageapp_test_logs_")

    flask_app = create_app(TestConfig)
    yield flask_app
    shutil.rmtree(flask_app.config["TEMP_DIR"], ignore_errors=True)
    shutil.rmtree(flask_app.config["LOG_DIR"], ignore_errors=True)


@pytest.fixture
def client(app):
    return app.test_client()
