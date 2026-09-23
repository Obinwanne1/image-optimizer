import os
import tempfile


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", 100 * 1024 * 1024))
    MAX_SINGLE_FILE_SIZE = int(os.environ.get("MAX_SINGLE_FILE_SIZE", 25 * 1024 * 1024))
    MAX_IMAGE_DIMENSION_PIXELS = int(os.environ.get("MAX_IMAGE_DIMENSION_PIXELS", 8000 * 8000))
    MAX_BATCH_FILES = int(os.environ.get("MAX_BATCH_FILES", 30))

    TEMP_DIR = os.environ.get("IMAGEAPP_TEMP_DIR", os.path.join(tempfile.gettempdir(), "imageapp"))

    SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", 45 * 60))
    CLEANUP_INTERVAL_SECONDS = int(os.environ.get("CLEANUP_INTERVAL_SECONDS", 5 * 60))

    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
    LOG_DIR = os.environ.get("LOG_DIR", "logs")

    ALLOWED_INPUT_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "bmp", "gif"}
    ALLOWED_INPUT_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "GIF"}
    ALLOWED_OUTPUT_FORMATS = {"JPEG", "PNG", "WEBP"}
