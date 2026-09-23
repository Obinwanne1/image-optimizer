import re
import uuid


def new_id() -> str:
    return uuid.uuid4().hex


def human_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(name: str, fallback: str = "image") -> str:
    if not name:
        return fallback
    name = name.strip().replace(" ", "_")
    name = _SAFE_NAME_RE.sub("", name)
    name = name.lstrip(".")
    return name or fallback


def filename_with_extension(base_name: str, fmt: str) -> str:
    ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}.get(fmt, fmt.lower())
    stem = base_name.rsplit(".", 1)[0] if "." in base_name else base_name
    stem = safe_filename(stem, "image")
    return f"{stem}.{ext}"
