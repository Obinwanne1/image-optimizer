from typing import Any, Dict, List, Tuple

from . import background as bg_module
from .image_processor import apply_settings
from .responses import build_process_result
from .settings import ImageSettings


def run_pipeline(store, image_id: str, settings: ImageSettings) -> Tuple[bytes, Dict[str, Any], List[str]]:
    """Single entry point every blueprint uses to run the processing pipeline, so the
    background-removal/background-image wiring only has to be correct in one place."""
    if settings.remove_background:
        working_bytes = store.get_or_compute_working_bytes(image_id, bg_module.remove_background_bytes)
    else:
        working_bytes = store.get_original_bytes(image_id)
    info = store.get_info(image_id)
    format_hint = "PNG" if settings.remove_background else info["format"]
    background_bytes = store.get_background_image_bytes(image_id) if settings.background_mode == "image" else None
    return apply_settings(working_bytes, settings, original_format_hint=format_hint, background_bytes=background_bytes)


def run_and_persist(store, image_id: str, settings: ImageSettings) -> Dict[str, Any]:
    """Runs the pipeline, persists the resulting settings as the session's current state, and
    builds the standard JSON response shape. The one call every mutating endpoint should use
    (process/reset/preset-apply/auto-optimize/batch-process) so that behavior can't drift
    between call sites."""
    output_bytes, stats, warnings = run_pipeline(store, image_id, settings)
    store.update_settings(image_id, settings.to_dict())
    return build_process_result(store, image_id, settings, output_bytes, stats, warnings)
