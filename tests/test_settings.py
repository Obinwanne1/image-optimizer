import pytest

from app.settings import ImageSettings, SettingsValidationError


def test_defaults_are_valid():
    settings = ImageSettings.from_dict({})
    assert settings.quality == 85
    assert settings.format == "ORIGINAL"


def test_unknown_field_rejected():
    with pytest.raises(SettingsValidationError):
        ImageSettings.from_dict({"not_a_real_field": 1})


def test_non_dict_rejected():
    with pytest.raises(SettingsValidationError):
        ImageSettings.from_dict(["not", "a", "dict"])


@pytest.mark.parametrize(
    "quality_in,expected",
    [(-5, 1), (0, 1), (1, 1), (100, 100), (150, 100), (85, 85)],
)
def test_quality_is_clamped_not_rejected(quality_in, expected):
    settings = ImageSettings.from_dict({"quality": quality_in})
    assert settings.quality == expected


def test_invalid_format_rejected():
    with pytest.raises(SettingsValidationError):
        ImageSettings.from_dict({"format": "TIFF"})


def test_invalid_resize_mode_rejected():
    with pytest.raises(SettingsValidationError):
        ImageSettings.from_dict({"resize_mode": "stretch"})


def test_dimensions_mode_requires_width_or_height():
    with pytest.raises(SettingsValidationError):
        ImageSettings.from_dict({"resize_mode": "dimensions"})


def test_dimensions_mode_accepts_width_only():
    settings = ImageSettings.from_dict({"resize_mode": "dimensions", "resize_width": 500})
    assert settings.resize_width == 500
    assert settings.resize_height is None


def test_crop_mode_requires_width_and_height():
    with pytest.raises(SettingsValidationError):
        ImageSettings.from_dict({"resize_mode": "crop", "crop_width": 100})


def test_crop_mode_clamps_negative_offsets_to_zero():
    settings = ImageSettings.from_dict(
        {"resize_mode": "crop", "crop_x": -50, "crop_y": -50, "crop_width": 100, "crop_height": 100}
    )
    assert settings.crop_x == 0
    assert settings.crop_y == 0


@pytest.mark.parametrize("bad_color", ["red", "#FFF", "#GGGGGG", "FFFFFF", ""])
def test_invalid_background_color_rejected(bad_color):
    with pytest.raises(SettingsValidationError):
        ImageSettings.from_dict({"background_color": bad_color})


def test_background_color_normalized_to_uppercase():
    settings = ImageSettings.from_dict({"background_color": "#abcdef"})
    assert settings.background_color == "#ABCDEF"


def test_rotate_degrees_normalized_modulo_360():
    settings = ImageSettings.from_dict({"rotate_degrees": 450})
    assert settings.rotate_degrees == 90


def test_invalid_background_mode_rejected():
    with pytest.raises(SettingsValidationError):
        ImageSettings.from_dict({"background_mode": "gradient"})
