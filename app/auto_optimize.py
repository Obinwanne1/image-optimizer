from .settings import ImageSettings

LONG_EDGE_CAP = 2048
LARGE_FILE_BYTES = 5 * 1024 * 1024
WELL_COMPRESSED_BPP = 0.15


def suggest_settings(info: dict) -> ImageSettings:
    """Deterministic heuristic from original image properties only — no re-degrading
    already-compressed JPEGs, downsizing oversized images, leaning WebP for large photos."""
    width, height = info["width"], info["height"]
    size_bytes = info["size_bytes"]
    has_alpha = info["has_alpha"]
    fmt = info["format"]

    overrides: dict = {"strip_metadata": True, "progressive": True, "auto_orient": True}

    if has_alpha and fmt == "PNG":
        overrides["format"] = "PNG"
        overrides["quality"] = 90
    else:
        bytes_per_pixel = size_bytes / max(1, width * height)
        if bytes_per_pixel < WELL_COMPRESSED_BPP:
            overrides["quality"] = 90
        elif size_bytes > LARGE_FILE_BYTES:
            overrides["format"] = "WEBP"
            overrides["quality"] = 78
        else:
            overrides["quality"] = 82

    long_edge = max(width, height)
    if long_edge > LONG_EDGE_CAP:
        overrides["resize_mode"] = "dimensions"
        overrides["maintain_aspect"] = True
        if width >= height:
            overrides["resize_width"] = LONG_EDGE_CAP
        else:
            overrides["resize_height"] = LONG_EDGE_CAP

    merged = ImageSettings().to_dict()
    merged.update(overrides)
    return ImageSettings.from_dict(merged)
