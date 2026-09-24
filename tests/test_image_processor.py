import io

import piexif
from PIL import Image

from app.image_processor import apply_settings, get_original_info
from app.settings import ImageSettings


def _jpeg_bytes_with_exif():
    img = Image.new("RGB", (100, 80), (200, 60, 60))
    exif_bytes = piexif.dump({"0th": {piexif.ImageIFD.Make: b"TestMake"}})
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif_bytes)
    return buf.getvalue()


def test_get_original_info_reports_dimensions_and_format(rgb_png_bytes):
    info = get_original_info(rgb_png_bytes)
    assert info["width"] == 100
    assert info["height"] == 80
    assert info["format"] == "PNG"
    assert info["has_alpha"] is False


def test_get_original_info_detects_alpha(rgba_png_bytes):
    info = get_original_info(rgba_png_bytes)
    assert info["has_alpha"] is True


def test_apply_settings_default_roundtrip_preserves_dimensions(rgb_png_bytes):
    settings = ImageSettings.from_dict({})
    output_bytes, stats, warnings = apply_settings(rgb_png_bytes, settings, original_format_hint="PNG")
    assert stats["width"] == 100
    assert stats["height"] == 80
    out_img = Image.open(io.BytesIO(output_bytes))
    out_img.verify()


def test_apply_settings_percentage_resize(rgb_png_bytes):
    settings = ImageSettings.from_dict({"resize_mode": "percentage", "resize_percentage": 50})
    _output_bytes, stats, _warnings = apply_settings(rgb_png_bytes, settings, original_format_hint="PNG")
    assert stats["width"] == 50
    assert stats["height"] == 40


def test_apply_settings_flattens_transparency_for_jpeg_and_warns(rgba_png_bytes):
    settings = ImageSettings.from_dict({"format": "JPEG"})
    output_bytes, stats, warnings = apply_settings(rgba_png_bytes, settings, original_format_hint="PNG")
    assert stats["format"] == "JPEG"
    assert "transparency_flattened" in warnings
    out_img = Image.open(io.BytesIO(output_bytes))
    assert out_img.mode in ("RGB", "L")


def test_apply_settings_preserves_transparency_for_png(rgba_png_bytes):
    settings = ImageSettings.from_dict({"format": "PNG"})
    _output_bytes, _stats, warnings = apply_settings(rgba_png_bytes, settings, original_format_hint="PNG")
    assert "transparency_flattened" not in warnings


def test_apply_settings_grayscale(rgb_png_bytes):
    settings = ImageSettings.from_dict({"grayscale": True})
    output_bytes, _stats, _warnings = apply_settings(rgb_png_bytes, settings, original_format_hint="PNG")
    out_img = Image.open(io.BytesIO(output_bytes))
    assert out_img.mode in ("L", "LA")


def test_apply_settings_rotate_90_swaps_dimensions(rgb_png_bytes):
    settings = ImageSettings.from_dict({"rotate_degrees": 90})
    _output_bytes, stats, _warnings = apply_settings(rgb_png_bytes, settings, original_format_hint="PNG")
    assert stats["width"] == 80
    assert stats["height"] == 100


def test_apply_settings_preserves_exif_in_png_output_when_not_stripped():
    settings = ImageSettings.from_dict({"format": "PNG", "strip_metadata": False})
    output_bytes, _stats, _warnings = apply_settings(_jpeg_bytes_with_exif(), settings, original_format_hint="JPEG")
    out_img = Image.open(io.BytesIO(output_bytes))
    assert "exif" in out_img.info


def test_apply_settings_strips_exif_from_png_output_by_default():
    settings = ImageSettings.from_dict({"format": "PNG"})  # strip_metadata defaults to True
    output_bytes, _stats, _warnings = apply_settings(_jpeg_bytes_with_exif(), settings, original_format_hint="JPEG")
    out_img = Image.open(io.BytesIO(output_bytes))
    assert "exif" not in out_img.info
