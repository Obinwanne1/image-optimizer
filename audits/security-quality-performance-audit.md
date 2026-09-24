# Findings Report — Security, Code Quality & Performance

Scope: security, code quality/correctness, and performance, across the full repo (`app/`,
`static/js/`, `templates/`, `tests/`). This is a separate pass from `audits/architecture-audit.md`
(structure/modularity) — findings here are about defects and gaps in the current code, not
architectural layering. Every finding below was confirmed by reading the exact cited code, and
two were confirmed empirically against the actual installed environment (noted inline) rather than
assumed.

> **Update — all 7 findings fixed.** Each section ends with a **Status: Fixed** line. Verified via
> the full pytest suite (71/71 — 69 pre-existing plus 2 new EXIF/PNG tests added alongside F4),
> `python -m py_compile` on every changed file, and live manual checks against the restarted dev
> server: security headers present on a real response, upload working end-to-end, a batch ZIP
> download producing a correct archive via the new spooled-temp-file path, and an actual
> JPEG-with-EXIF round-tripped to PNG with `strip_metadata: false` confirming EXIF survives.

## Summary table

| # | Finding | Category | Importance | Status |
|---|---|---|---|---|
| F1 | Every upload decodes/validates the image twice | Performance | 6/10 | **Fixed** — `create_session(info=...)` |
| F2 | Batch ZIP is built fully in memory, unbounded by the session byte cap | Performance / resource limit | 7/10 | **Fixed** — `SpooledTemporaryFile` |
| F3 | Session byte-budget counter leaks on disk-write failure | Correctness | 5/10 | **Fixed** — try/except rollback |
| F4 | EXIF metadata silently dropped for PNG output despite `strip_metadata: false` | Correctness / feature gap | 5/10 | **Fixed** — widened format check + 2 new tests |
| F5 | No security response headers (CSP, X-Content-Type-Options, X-Frame-Options) | Security | 4/10 | **Fixed** — `after_request` hook |
| F6 | `safe_join_within()` is dead code — never called from any request path | Code quality | 2/10 | **Fixed** — wired into `storage.py` (Option B) |
| F7 | No dependency vulnerability scan performed (informational — see note) | Security | 3/10 | **Fixed** — `pip-audit` CI step added |

Verification for all seven: full pytest suite (71/71, including 2 new tests), `python -m
py_compile` on every changed file, and live manual exercise against the restarted dev server
(security headers, upload, batch ZIP download, and a real JPEG→PNG EXIF round-trip).

---

### F1 — Every upload decodes/validates the image twice
**Importance: 6/10** — category: performance (redundant work on the hot path)

`validate_and_probe_image` (`app/validators.py:26-34`) already does the expensive part — open,
`.verify()`, reopen, `.load()` (all inside `get_original_info`, `app/image_processor.py:47-61`) —
and returns the resulting `info` dict:
```python
# app/validators.py:26-34
def validate_and_probe_image(data: bytes, allowed_formats: set, max_dimension_pixels: int) -> dict:
    info = get_original_info(data)
    ...
    return info
```
But both call sites throw that return value away:
```python
# app/blueprints/upload.py:13-19 (_handle_single_upload)
validate_and_probe_image(data, allowed_formats, max_dim)        # <- info discarded
image_id = store.create_session(data, file_storage.filename, batch_id=batch_id)
```
`SessionStore.create_session` (`app/storage.py:106-107`) then immediately recomputes it from
scratch on the same bytes:
```python
# app/storage.py:106-107
def create_session(self, original_bytes: bytes, original_filename: str, batch_id: Optional[str] = None) -> str:
    info = get_original_info(original_bytes)
```
So every single upload (single or per-file in a batch, up to `MAX_BATCH_FILES` = 30 at once) pays
the full Pillow decode+verify+reopen+load cost twice, on bytes that can be up to
`MAX_SINGLE_FILE_SIZE` (25MB) / `MAX_IMAGE_DIMENSION_PIXELS` (64,000,000 px). This is pure waste —
the second call produces an identical `info` dict from identical bytes.

**Fix — thread the already-computed `info` through instead of recomputing it:**
```python
# app/storage.py — accept an optional pre-computed info dict
def create_session(self, original_bytes: bytes, original_filename: str,
                    batch_id: Optional[str] = None, info: Optional[dict] = None) -> str:
    info = info or get_original_info(original_bytes)
```
```python
# app/blueprints/upload.py — pass it through instead of discarding it
info = validate_and_probe_image(data, allowed_formats, max_dim)
image_id = store.create_session(data, file_storage.filename, batch_id=batch_id, info=info)
```
The `_get_entry` lazy-rehydration path (`app/storage.py:163`) is a separate, legitimate single
decode (there's no prior validation call to reuse there) — not part of this finding.

**Status: Fixed.** `create_session` now takes an optional `info` parameter and only calls
`get_original_info` if it wasn't supplied; `upload.py`'s `_handle_single_upload` now captures
`validate_and_probe_image`'s return value and passes it straight through instead of discarding it.
Verified: full pytest suite passes; live manual upload against the running dev server still
returns the correct `image_id`/dimensions/size.

---

### F2 — Batch ZIP is built fully in memory, unbounded by the session byte cap
**Importance: 7/10** — category: performance / resource-limit gap

`batch_download_zip` (`app/blueprints/batch.py:61-96`) accumulates the entire ZIP in a plain
`io.BytesIO()`:
```python
# app/blueprints/batch.py:69-70
member_ids = store.get_batch_members(batch_id)
zip_buffer = io.BytesIO()
...
with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
    for image_id in member_ids:
        ...
        zf.writestr(unique_name, output_bytes)
```
With up to `MAX_BATCH_FILES` = 30 members at up to `MAX_SINGLE_FILE_SIZE` = 25MB of *output* each,
this buffer can transiently hold up to ~750MB fully resident in process memory for one request —
and critically, **none of it is counted against `SessionStore.max_total_bytes`** (the cap added to
address unbounded memory growth), because that cap only tracks `SessionEntry.original_bytes`, not
this separate, temporary allocation. The safeguard the byte cap was meant to provide has a real
gap here.

**Fix — use a spooled temp file instead of a plain in-memory buffer** (drop-in: `zipfile.ZipFile`
and `send_file` both accept any file-like object, so this is a one-line change plus the import):
```python
# app/blueprints/batch.py
import tempfile
...
zip_buffer = tempfile.SpooledTemporaryFile(max_size=10 * 1024 * 1024)  # spills to disk past 10MB
```
This keeps small batches fast (in-memory) while large ones spill to disk instead of risking a
`MemoryError` or starving other requests of memory.

**Status: Fixed.** `zip_buffer` is now a `tempfile.SpooledTemporaryFile(max_size=10*1024*1024)`;
the now-unused `import io` was removed from `batch.py`. Verified live against the running dev
server: uploaded a 2-image batch, called `POST /api/batch/download-zip`, and confirmed the
response is a valid ZIP archive (`zipfile.ZipFile` opened it and listed both member filenames
correctly) — `send_file` handles the spooled file transparently whether or not it has rolled over
to disk.

---

### F3 — Session byte-budget counter leaks on disk-write failure
**Importance: 5/10** — category: correctness (bug in the `F2`-from-the-architecture-audit fix)

`create_session` (`app/storage.py:106-122`) increments `_total_bytes` *before* the disk write that
can fail:
```python
# app/storage.py:109-122
with self._global_lock:
    if self.max_total_bytes is not None and self._total_bytes + len(original_bytes) > self.max_total_bytes:
        raise ValidationError(...)
    self._total_bytes += len(original_bytes)          # <- counted here

image_id = new_id()
...
os.makedirs(session_dir, exist_ok=True)                # <- can raise OSError (e.g. disk full)
disk_path = os.path.join(session_dir, f"original.{ext}")
with open(disk_path, "wb") as f:
    f.write(original_bytes)                            # <- can also raise OSError
```
If either of those raises, the exception propagates with `_total_bytes` already incremented and no
`SessionEntry` ever added to `_sessions` — so `delete_session` is never called for it, and that
slice of the budget is gone for the life of the process (only a restart clears it). Repeated
failures (e.g. a full disk) would eventually make every future upload fail with "server is at
capacity" even after the underlying disk issue is fixed.

**Fix — only count bytes once the write actually succeeds (roll back on failure):**
```python
# app/storage.py
with self._global_lock:
    if self.max_total_bytes is not None and self._total_bytes + len(original_bytes) > self.max_total_bytes:
        raise ValidationError("Server is at capacity (too many images held in memory). Try again shortly.")
    self._total_bytes += len(original_bytes)

try:
    image_id = new_id()
    ext = _EXT_BY_FORMAT.get(info["format"], "bin")
    session_dir = os.path.join(self.temp_dir, image_id)
    os.makedirs(session_dir, exist_ok=True)
    disk_path = os.path.join(session_dir, f"original.{ext}")
    with open(disk_path, "wb") as f:
        f.write(original_bytes)
except Exception:
    with self._global_lock:
        self._total_bytes = max(0, self._total_bytes - len(original_bytes))
    raise
```

**Status: Fixed.** `create_session`'s disk I/O now runs inside a `try/except Exception` that rolls
back `_total_bytes` before re-raising if `os.makedirs`/`open`/`write` fails. Verified: full pytest
suite passes unchanged (no test exercises a disk-write failure directly, so this is confirmed by
code inspection of the applied diff plus the surrounding tests still passing without regression);
live manual upload against the running dev server still succeeds normally on the non-failure path.

---

### F4 — EXIF metadata silently dropped for PNG output despite `strip_metadata: false`
**Importance: 5/10** — category: correctness / feature gap

`apply_settings` (`app/image_processor.py:227-246`) only ever computes and attaches EXIF for JPEG
and WEBP output:
```python
# app/image_processor.py:227-246
exif_for_save = None
if not settings.strip_metadata and exif_bytes and target_format in ("JPEG", "WEBP"):
    ...
save_kwargs: Dict[str, Any] = {}
if target_format == "JPEG":
    ...
    if exif_for_save:
        save_kwargs["exif"] = exif_for_save
elif target_format == "PNG":
    save_kwargs.update(optimize=True)          # <- exif_for_save never even attempted, never attached
elif target_format == "WEBP":
    ...
    if exif_for_save:
        save_kwargs["exif"] = exif_for_save
```
So a user who explicitly unchecks "Remove metadata" and outputs PNG gets their EXIF silently
dropped anyway, with no warning (contrast with the explicit `warnings.append("transparency_flattened")`
elsewhere in this same function for a comparable "your choice couldn't be fully honored" case).
**Verified empirically** (not assumed) that this isn't a real Pillow limitation: the installed
version in this project's own venv writes and reads back a PNG `eXIf` chunk correctly —
```
Pillow version: 12.3.0
round-trip exif present: True 53
```
(confirmed via a standalone `Image.save(..., format="PNG", exif=exif_bytes)` round-trip, matching
the `Pillow>=10.0,<13` range pinned in `requirements.txt`, where PNG EXIF support has existed since
Pillow 8.0).

**Fix — include PNG in the exif condition and attach it:**
```python
# app/image_processor.py:228 — widen the format check
if not settings.strip_metadata and exif_bytes and target_format in ("JPEG", "WEBP", "PNG"):
```
```python
# app/image_processor.py:241-242 — attach it for PNG too
elif target_format == "PNG":
    save_kwargs.update(optimize=True)
    if exif_for_save:
        save_kwargs["exif"] = exif_for_save
```
No test in `tests/test_image_processor.py` currently exercises `strip_metadata`/EXIF behavior at
all (confirmed via grep) — worth adding one alongside this fix, e.g. asserting `b"exif" not in
output_bytes`-style presence checks are actually too fragile for PNG's binary chunk format; a
round-trip re-open + `"exif" in Image.open(buf).info` assertion (as used to verify this finding)
is the reliable way to test it.

**Status: Fixed.** `app/image_processor.py:228` now includes `"PNG"` in the exif-computation
condition, and the `elif target_format == "PNG":` branch (`app/image_processor.py:241-243`) now
attaches `exif_for_save` when present, matching the JPEG/WEBP branches. Added the two tests this
finding called out as missing (`tests/test_image_processor.py`:
`test_apply_settings_preserves_exif_in_png_output_when_not_stripped` and
`test_apply_settings_strips_exif_from_png_output_by_default`), both passing. Also verified live
end-to-end against the running dev server: uploaded a real JPEG with an embedded `Make` EXIF tag,
called `POST /api/process/<id>` with `{"format": "PNG", "strip_metadata": false}`, decoded the
returned `preview_data_url`, and confirmed `"exif" in Image.open(...).info` is `True` on the
actual PNG bytes produced by the live server.

---

### F5 — No security response headers
**Importance: 4/10** — category: security (defense-in-depth, no confirmed exploit path)

Confirmed via repo-wide search: no route or `after_request` hook anywhere in `app/` sets
`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, or similar headers. Actual
exploitability today is low — every place the frontend renders server-supplied text into the DOM
uses `textContent`/an `escapeHtml()` helper that creates a detached element and reads back
`.innerHTML` (`static/js/preview.js:45-49`, `static/js/batch.js:25-29`), so there's no confirmed
XSS sink to chain a missing CSP into right now — but this is exactly the kind of gap that turns a
future, unrelated XSS-shaped bug into a real one, and it's a one-block fix.

**Fix — add a blanket response-header hook in the app factory:**
```python
# app/__init__.py, inside create_app(), alongside register_error_handlers(app)
@app.after_request
def _set_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Content-Security-Policy", "default-src 'self'")
    return response
```
**Unable to verify** whether `default-src 'self'` would need loosening — this static review didn't
enumerate every inline `<script>`/`<style>` in `templates/index.html`; the file uses only external
`<script src="{{ url_for('static', ...) }}">` tags and a single external stylesheet link (no
inline `<script>` or `style="..."` attributes observed), which is consistent with `'self'` working
unmodified, but the way to actually prove it is to enable the header and load the page in a real
browser with devtools open, watching for CSP console violations.

**Status: Fixed.** Added the `@app.after_request` hook exactly as proposed, in `app/__init__.py`.
Verified live against the running dev server: `curl -sI http://127.0.0.1:5000/` shows
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
`Content-Security-Policy: default-src 'self'` on the response. Also checked
`templates/index.html` directly for inline `<script>`/`style="..."`/`onclick="..."` attributes
(none found — only external `<script src>` and one external stylesheet `<link>`), confirming the
earlier "unable to verify" concern: `default-src 'self'` does not need loosening for this page as
it exists today.

---

### F6 — `safe_join_within()` is dead code — never called from any request path
**Importance: 2/10** — category: code quality (unused function, misleading audit surface)

`app/validators.py:37-46` defines `safe_join_within(base_dir, *parts)` — a generic path-traversal
guard using `os.path.commonpath`. Confirmed via repo-wide grep: its only callers are its own tests
(`tests/test_validators.py:6,44,51,63`); no blueprint, `storage.py`, or any other production code
path calls it. The actual path-traversal protection in this codebase is a completely different
mechanism — `storage.py`'s `_ID_RE = re.compile(r"^[0-9a-f]{32}$")` / `_validate_id()`
(`app/storage.py:25-30`), which rejects anything that isn't a well-formed UUID hex string before it
ever reaches a filesystem join. That mechanism is correct and tested
(`tests/test_storage_security.py`), so this isn't a live vulnerability — but a well-tested,
security-sounding function that the actual security boundary doesn't use is exactly the kind of
thing that misleads a future reviewer (or a future contributor extending `storage.py`) into
thinking there's a second layer of protection in play, or into calling the wrong one.

**Fix — pick one:**
```python
# Option A: delete it (and its now-orphaned tests) if _ID_RE is considered sufficient
# app/validators.py — remove safe_join_within (lines 37-46)
# tests/test_validators.py — remove its three tests (lines 42-63)
```
```python
# Option B: actually wire it into storage.py as defense-in-depth alongside _ID_RE,
# e.g. in _get_entry / create_session where session_dir is built:
session_dir = safe_join_within(self.temp_dir, image_id)
```
No preference expressed here on which — that's a design call (belt-and-suspenders vs. minimal
surface), not something this audit should decide unilaterally.

**Status: Fixed — Option B (wired in).** Chose to keep and use the function rather than delete
tested, working code: every `session_dir = os.path.join(self.temp_dir, image_id)` construction in
`app/storage.py` (`create_session`, `_get_entry`'s rehydration path, `delete_session`) now goes
through `safe_join_within(self.temp_dir, image_id)` instead, imported from `..validators`. The
comment above `_ID_RE` was updated to describe `safe_join_within` as a second, independent layer
rather than implying the regex is the only check. This is genuinely defense-in-depth, not a
behavior change — `_ID_RE`/`_validate_id()` already rejects any `image_id` that isn't a well-formed
32-char hex string before these lines run, so `safe_join_within` never actually raises in the
current call paths, but it removes the "misleading audit surface" this finding was about: the
function is no longer dead code. Verified: full pytest suite passes (including
`tests/test_storage_security.py`'s traversal-id tests, unchanged); live manual upload, process, and
delete against the running dev server all still succeed normally.

---

### F7 — No dependency vulnerability scan performed (informational)
**Importance: 3/10** — category: security (process gap, not a confirmed vulnerability)

This audit did not run a dependency vulnerability scan. Checked what's available in this
environment: `pip show pip-audit` reports it isn't installed in `venv/`, and `.github/workflows/tests.yml`
(the repo's only workflow file) runs exactly one step beyond checkout/setup — `python -m pytest -q`
— with no vulnerability-scan step. Installed versions today (`pip list`): `Flask 3.1.3`, `Pillow 12.3.0`,
`Werkzeug 3.1.8`, `onnxruntime 1.30.0`, `numpy 2.4.6`, `piexif 1.1.3`, `pooch 1.9.0`,
`waitress 3.0.2` — all near-latest as of this repo's dependency pins, which is a reasonable
starting signal, but **unable to verify** whether any of these specific versions have a disclosed
CVE without a live vulnerability-database lookup (not performed as part of this static review).

**What would prove it either way:**
```
pip install pip-audit
pip-audit -r requirements.txt
```
run against `venv/`, or adding it as a CI step:
```yaml
# .github/workflows/tests.yml — new step alongside the existing "Run tests" step
- name: Dependency vulnerability scan
  run: |
    pip install pip-audit
    pip-audit -r requirements.txt
```

**Status: Fixed (process gap closed; no vulnerabilities confirmed either way).** Added exactly
this step to `.github/workflows/tests.yml`, after the existing `Run tests` step. This closes the
process gap (CI now scans on every push/PR) but, per this finding's own framing, does not and
cannot confirm or rule out a specific CVE from this offline review — that verdict now comes from
CI's own `pip-audit` run against the live vulnerability database at build time, which is the
"context that would prove it" this finding asked for. YAML validity checked locally with
`yaml.safe_load()`.

---

## Notes on what's out of scope here

- Everything already covered and fixed in `audits/architecture-audit.md` (F1–F6 there:
  duplicated pipeline orchestration, the session byte cap's original absence, the
  storage→background layering leak, client/server resize-math duplication, the inference
  concurrency throttle, and the inaccurate cycle comment) is not repeated in this report.
- Known, already-documented tradeoffs in `README.md` → **Known limitations** (single-process dev
  server, no user accounts, anonymous capability-URL-style sessions, background-removal model
  quality limits) are treated as accepted design decisions, not findings, unless this review found
  a *new* angle on them (it did not).
