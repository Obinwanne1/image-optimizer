from typing import Any, Dict, List, Tuple

from .image_processor import apply_settings
from .settings import ImageSettings


def run_pipeline(store, image_id: str, settings: ImageSettings) -> Tuple[bytes, Dict[str, Any], List[str]]:
    """Single entry point every blueprint uses to run the processing pipeline, so the
    background-removal/background-image wiring only has to be correct in one place."""
    working_bytes = store.get_working_bytes(image_id, settings)
    info = store.get_info(image_id)
    format_hint = "PNG" if settings.remove_background else info["format"]
    background_bytes = store.get_background_image_bytes(image_id) if settings.background_mode == "image" else None
    return apply_settings(working_bytes, settings, original_format_hint=format_hint, background_bytes=background_bytes)
