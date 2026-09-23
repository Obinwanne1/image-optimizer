import re
from dataclasses import dataclass, asdict, fields
from typing import Optional

RESIZE_MODES = {"none", "percentage", "dimensions", "crop"}
FORMATS = {"ORIGINAL", "JPEG", "PNG", "WEBP"}
BACKGROUND_MODES = {"transparent", "color", "image"}
_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class SettingsValidationError(ValueError):
    pass


def _clamp(value, lo, hi):
    return max(lo, min(hi, value))


@dataclass
class ImageSettings:
    quality: int = 85
    format: str = "ORIGINAL"

    sharpen_amount: float = 0.0
    sharpen_radius: float = 2.0
    blur_amount: float = 0.0

    brightness: float = 1.0
    contrast: float = 1.0
    saturation: float = 1.0
    exposure: int = 0

    grayscale: bool = False

    rotate_degrees: int = 0
    flip_horizontal: bool = False
    flip_vertical: bool = False

    resize_mode: str = "none"
    resize_width: Optional[int] = None
    resize_height: Optional[int] = None
    resize_percentage: float = 100.0
    maintain_aspect: bool = True

    # Crop rectangle, in the ORIGINAL image's pixel coordinates (post auto-orient, since
    # that's what the browser and the pipeline both treat as "the image" by default).
    crop_x: int = 0
    crop_y: int = 0
    crop_width: Optional[int] = None
    crop_height: Optional[int] = None

    strip_metadata: bool = True
    progressive: bool = True
    lossless: bool = False
    webp_method: int = 4
    auto_orient: bool = True

    remove_background: bool = False
    background_mode: str = "transparent"
    background_color: str = "#FFFFFF"

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "ImageSettings":
        if not isinstance(data, dict):
            raise SettingsValidationError("settings must be a JSON object")
        valid_fields = {f.name for f in fields(cls)}
        unknown = set(data.keys()) - valid_fields
        if unknown:
            raise SettingsValidationError(f"unknown settings field(s): {', '.join(sorted(unknown))}")
        # start from defaults, then overlay provided values so partial dicts still work
        merged = cls().to_dict()
        merged.update(data)
        instance = cls(**merged)
        instance.validate()
        return instance

    def validate(self) -> None:
        if self.format not in FORMATS:
            raise SettingsValidationError(f"format must be one of {sorted(FORMATS)}")
        if self.resize_mode not in RESIZE_MODES:
            raise SettingsValidationError(f"resize_mode must be one of {sorted(RESIZE_MODES)}")
        if self.background_mode not in BACKGROUND_MODES:
            raise SettingsValidationError(f"background_mode must be one of {sorted(BACKGROUND_MODES)}")
        if not _HEX_COLOR_RE.match(self.background_color or ""):
            raise SettingsValidationError("background_color must be a hex color like '#FFFFFF'")

        try:
            self.quality = int(_clamp(int(self.quality), 1, 100))
            self.sharpen_amount = float(_clamp(float(self.sharpen_amount), 0, 500))
            self.sharpen_radius = float(_clamp(float(self.sharpen_radius), 0.1, 10.0))
            self.blur_amount = float(_clamp(float(self.blur_amount), 0, 20.0))
            self.brightness = float(_clamp(float(self.brightness), 0.0, 3.0))
            self.contrast = float(_clamp(float(self.contrast), 0.0, 3.0))
            self.saturation = float(_clamp(float(self.saturation), 0.0, 3.0))
            self.exposure = int(_clamp(int(self.exposure), -100, 100))
            self.rotate_degrees = int(self.rotate_degrees) % 360
            self.resize_percentage = float(_clamp(float(self.resize_percentage), 1, 500))
            self.webp_method = int(_clamp(int(self.webp_method), 0, 6))

            if self.resize_mode == "dimensions":
                if self.resize_width is None and self.resize_height is None:
                    raise SettingsValidationError(
                        "resize_width or resize_height required when resize_mode is 'dimensions'"
                    )
                if self.resize_width is not None:
                    self.resize_width = int(_clamp(int(self.resize_width), 1, 8000))
                if self.resize_height is not None:
                    self.resize_height = int(_clamp(int(self.resize_height), 1, 8000))

            if self.resize_mode == "crop":
                if self.crop_width is None or self.crop_height is None:
                    raise SettingsValidationError(
                        "crop_width and crop_height are required when resize_mode is 'crop'"
                    )
                self.crop_x = int(_clamp(int(self.crop_x), 0, 100000))
                self.crop_y = int(_clamp(int(self.crop_y), 0, 100000))
                self.crop_width = int(_clamp(int(self.crop_width), 1, 100000))
                self.crop_height = int(_clamp(int(self.crop_height), 1, 100000))
        except SettingsValidationError:
            raise
        except (TypeError, ValueError) as exc:
            raise SettingsValidationError(f"Invalid numeric value in settings: {exc}")

        self.grayscale = bool(self.grayscale)
        self.flip_horizontal = bool(self.flip_horizontal)
        self.flip_vertical = bool(self.flip_vertical)
        self.maintain_aspect = bool(self.maintain_aspect)
        self.strip_metadata = bool(self.strip_metadata)
        self.progressive = bool(self.progressive)
        self.lossless = bool(self.lossless)
        self.auto_orient = bool(self.auto_orient)
        self.remove_background = bool(self.remove_background)
        self.background_color = self.background_color.upper()


DEFAULT_SETTINGS = ImageSettings()
