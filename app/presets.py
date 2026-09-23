from typing import Optional

from .errors import ValidationError
from .settings import ImageSettings

# Each preset is a partial overlay merged onto ImageSettings defaults. `resize_long_edge`,
# when set, is resolved per-image at apply time (not a fixed width/height) so the same
# preset behaves sensibly across portrait/landscape/square originals. All resulting
# settings remain user-editable afterward — presets only seed the starting point.

PRESETS = {
    "maximum_quality": {
        "name": "Maximum Quality",
        "description": "Highest fidelity, minimal compression. Larger file sizes.",
        "overlay": {"quality": 95, "strip_metadata": False, "progressive": True},
        "resize_long_edge": None,
    },
    "balanced": {
        "name": "Balanced",
        "description": "Good quality with meaningful size savings. A sensible default.",
        "overlay": {"quality": 85, "strip_metadata": True, "progressive": True},
        "resize_long_edge": None,
    },
    "small_file_size": {
        "name": "Small File Size",
        "description": "Aggressive compression for the smallest possible file.",
        "overlay": {"format": "JPEG", "quality": 65, "strip_metadata": True, "progressive": True},
        "resize_long_edge": None,
    },
    "web": {
        "name": "Web / Website",
        "description": "WebP output tuned for fast-loading website images.",
        "overlay": {"format": "WEBP", "quality": 80, "webp_method": 4, "strip_metadata": True},
        "resize_long_edge": 1920,
    },
    "social_media": {
        "name": "Social Media",
        "description": "Sized and compressed for social platform uploads.",
        "overlay": {"format": "JPEG", "quality": 80, "strip_metadata": True, "progressive": True},
        "resize_long_edge": 1080,
    },
    "email": {
        "name": "Email",
        "description": "Small enough to attach without hitting size limits.",
        "overlay": {"format": "JPEG", "quality": 70, "strip_metadata": True, "progressive": True},
        "resize_long_edge": 1024,
    },
    "mobile": {
        "name": "Mobile",
        "description": "Lightweight WebP for mobile apps and slow connections.",
        "overlay": {"format": "WEBP", "quality": 75, "strip_metadata": True, "webp_method": 4},
        "resize_long_edge": 750,
    },
    "ecommerce": {
        "name": "E-commerce",
        "description": "Crisp product photography with a slight sharpen boost.",
        "overlay": {"format": "JPEG", "quality": 85, "sharpen_amount": 50, "strip_metadata": True},
        "resize_long_edge": 2048,
    },
    "thumbnail": {
        "name": "Thumbnail",
        "description": "Small square-ish preview images.",
        "overlay": {"format": "JPEG", "quality": 70, "strip_metadata": True},
        "resize_long_edge": 200,
    },
}


def list_presets() -> list:
    result = []
    for preset_id, preset in PRESETS.items():
        merged = ImageSettings().to_dict()
        merged.update(preset["overlay"])
        result.append(
            {
                "id": preset_id,
                "name": preset["name"],
                "description": preset["description"],
                "resize_long_edge": preset["resize_long_edge"],
                "settings": merged,
            }
        )
    return result


def resolve_preset(preset_id: str, width: int, height: int) -> ImageSettings:
    preset = PRESETS.get(preset_id)
    if preset is None:
        raise ValidationError(f"Unknown preset id '{preset_id}'.")

    merged = ImageSettings().to_dict()
    merged.update(preset["overlay"])

    long_edge: Optional[int] = preset["resize_long_edge"]
    if long_edge and max(width, height) > long_edge:
        merged["resize_mode"] = "dimensions"
        merged["maintain_aspect"] = True
        if width >= height:
            merged["resize_width"] = long_edge
            merged["resize_height"] = None
        else:
            merged["resize_height"] = long_edge
            merged["resize_width"] = None

    return ImageSettings.from_dict(merged)
