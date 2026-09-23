import base64

_MIME_BY_FORMAT = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def build_process_result(store, image_id: str, settings, output_bytes: bytes, stats: dict, warnings: list) -> dict:
    info = store.get_info(image_id)
    mime = _MIME_BY_FORMAT.get(stats["format"], "application/octet-stream")
    preview_data_url = f"data:{mime};base64,{base64.b64encode(output_bytes).decode('ascii')}"
    settings_dict = settings.to_dict() if hasattr(settings, "to_dict") else settings

    # "Original" always means the true uploaded file, even when the pipeline's actual
    # input was a cached background-removed cutout (a derived, size-irrelevant artifact).
    stats = dict(stats)
    true_original_size = info["size_bytes"]
    stats["original_size_bytes"] = true_original_size
    stats["reduction_percent"] = (
        round((1 - len(output_bytes) / true_original_size) * 100, 1) if true_original_size else 0.0
    )

    return {
        "image_id": image_id,
        "original": info,
        "settings": settings_dict,
        "output": stats,
        "preview_data_url": preview_data_url,
        "warnings": warnings,
    }
