# Session Notes

Narrative record of how this app was built and why, for anyone (including a future session)
picking this project back up. The README covers setup/usage/architecture as it stands today;
this file covers the decisions, dead ends, and gotchas behind how it got there.

## What this project is

A Flask image optimization web app, built from scratch in `C:\Users\rigwe\Desktop\ImageApp`
(started as an empty directory). Core requirement: upload an image once, then adjust any number
of settings repeatedly without re-uploading — every apply recomputes fresh from the immutable
original, never chains off a previous output.

## Build order (roughly chronological)

1. **Core app** — Flask factory, hybrid memory+disk `SessionStore`, the non-destructive Pillow
   pipeline (`image_processor.py`), settings model, presets, auto-optimize heuristic, upload/
   process/download/batch blueprints, vanilla-JS frontend (no build tooling). Full manual test
   checklist run against the live dev server before calling it done.
2. **Bug: perpetual "Processing…" overlay with broken images on load.** Root cause: several CSS
   classes (`.editor`, `.batch-editor`, `.preset-dims`, `.processing-indicator`) set `display`
   unconditionally, and an author-stylesheet rule always beats the browser's built-in
   `[hidden]{display:none}` rule at equal specificity — so those elements were visible on page
   load regardless of their `hidden` attribute. Fixed with a single global override:
   `[hidden] { display: none !important; }` in `static/css/style.css`. Worth remembering if any
   new `hidden`-attribute element ever gets its own unconditional `display` rule again.
3. **Background removal / replacement feature added.** See below — this was the most involved
   addition and hit a real environment-specific blocker.
4. **Interactive crop tool added** — `resize_mode: "crop"` with a real drag/resize box overlay
   (`static/js/crop.js`) on the original preview image, not just numeric target dimensions.
   Along the way, fixed `get_original_info()` to report post-EXIF-orientation dimensions (it was
   reporting raw on-disk pixel dimensions, which would have misaligned crop coordinates with
   what the browser actually displays for rotated phone photos).
5. **Background removal quality fix** — the first model/approach produced visible "ghosting" of
   other objects in busy scenes. Diagnosed from a user screenshot and fixed with a better model
   plus real mask post-processing. See below.

## The WDAC / rembg blocker (important if touching `app/background.py`)

The obvious library for background removal is `rembg`. It does not work on this machine:
`rembg/__init__.py` unconditionally imports `pymatting` → `numba` → `llvmlite`, and `llvmlite`
ships a native DLL that this machine's Windows Application Control policy (WDAC) blocks outright
(`OSError: [WinError 4551] An Application Control policy has blocked this file`). This is a
system security policy, not a bug — it was not and should not be bypassed.

Workaround: `rembg`'s actual model-loading code (`rembg/sessions/base.py`, `u2net.py`,
`dis_general_use.py`, etc.) only needs `onnxruntime` + `numpy` + `PIL` + `pooch` — none of the
blocked chain. Those files were read directly (`pip install rembg --no-deps` temporarily, to
inspect source only, then uninstalled again — `rembg` itself is never imported by this app) to
get the exact model URL, MD5 checksum, and pre/post-processing recipe, then reimplemented
directly in `app/background.py` against `onnxruntime`. `requirements.txt` lists `onnxruntime`,
`pooch`, `numpy` — deliberately not `rembg`.

If you ever see `llvmlite`/`numba`/`pymatting` show up again in a traceback on this machine,
that's this same policy — don't try to work around it with `rembg[gpu]` or similar; reimplement
against the underlying inference call the same way, or ask the user whether the WDAC policy can
be adjusted (their call, not something to route around silently).

## Background-removal model choice

Tried three tiers, in order:

| Model | Size | Notes |
|---|---|---|
| U2Net | 176MB | First choice. Works, but on busy/multi-subject scenes assigns partial confidence to *other* salient objects (other people, signage) instead of isolating one subject — shows up as visible ghosting. User reported this with a real screenshot. |
| **ISNet `isnet-general-use`** | 170MB | **Current default.** Same ballpark size as U2Net, much higher input resolution (1024×1024 vs 320×320), rembg's own recommended replacement for U2Net for this exact failure mode. |
| BiRefNet-general | 928MB | Checked (HEAD request against the GitHub release asset) — noticeably higher quality but ~5x the download and much slower CPU inference. Not worth it for this app; noted here in case someone wants an optional "max quality" tier later. |

Switching the model is not enough on its own — see next section. The old `u2net.onnx` was
deleted from `~/.imageapp/models/` after switching (170MB reclaimed); if you see it again,
something is still requesting it.

## Mask refinement (`app/background.py`)

Raw model output alone still isn't clean — a generic saliency model can score a genuinely
separate object (another person, say) almost as high as the real subject, so a confidence
threshold alone can't tell them apart (verified this quantitatively before concluding threshold
alone wasn't enough). Two refinement passes run after inference, in order:

1. **`_gate_to_largest_subject`** — downsamples the mask to 128×128, runs a pure-Python
   4-connectivity flood fill (`_largest_component_mask`) to find connected blobs, keeps only the
   largest one (dilated slightly first, to avoid clipping thin extremities like arms), and uses
   that as a multiplicative gate on the full-resolution mask. This is what actually removes a
   separate high-confidence distractor object — thresholding can't. Deliberately implemented in
   pure Python/numpy rather than pulling in `scipy.ndimage.label` or OpenCV, to avoid reintroducing
   another native-dependency risk on this WDAC-locked machine (untested territory — might be fine,
   might not, wasn't worth the risk for one function). At 128×128 this runs in ~10ms.
2. **`_refine_mask`** — linear confidence stretch (pixels ≤40 → transparent, ≥200 → opaque,
   between is linearly interpolated) plus a small Gaussian feather, so edges stay smooth instead
   of jagged after the harder cutoff.

Known remaining limitation (documented in README): the largest-component heuristic assumes the
intended subject is the biggest object in frame. A photo where the user wants to isolate a small
object against a larger backdrop (e.g. a product on a big table) will keep the wrong (larger)
thing. No true alpha-matting refinement either (that's the pymatting step blocked by WDAC), so
genuinely semi-transparent subjects (glass, smoke, veils, wisps of hair) won't get soft cutout
edges — they'll be more binary than a matting-based tool would produce.

Was not able to test against the user's actual failing photo (only had their screenshot, not the
source file) — the fix was validated with synthetic test masks (crafted arrays simulating a large
subject + high-confidence distractor blobs, confirming the gating logic removes them) plus a real
end-to-end run through the actual model to confirm no crashes and reasonable timing (~1.4s cached,
~7.6s including first-time model download). If ghosting still shows up on a specific real photo,
that photo is needed to tune the thresholds further.

## Architecture reference (see README for full detail)

- `app/image_processor.py` — the only place Pillow transforms happen; pure function
  (`apply_settings`), always recomputes from scratch. Fixed step order: orient → resize/crop →
  rotate/flip → grayscale → exposure/brightness/contrast/saturation → blur/sharpen → background
  composite → format/encode.
- `app/storage.py` — hybrid memory+disk `SessionStore`. Also owns the background-removal cutout
  cache (`get_working_bytes`) — expensive to compute, deterministic given the same original, so
  computed once per session and reused across every other setting change.
- `app/pipeline.py` — single entry point (`run_pipeline`) every blueprint uses, so the
  background-removal/background-image wiring can't accidentally be forgotten in one of the four
  call sites (upload/process/batch/download).
- `app/responses.py` — always reports "Original" size/reduction% against the *true* uploaded
  file, even when the pipeline's actual input was a cached bg-removed cutout.
- `static/js/crop.js` — self-contained interactive crop box (Pointer Events, works for mouse and
  touch), talks to `settings.js` only through `onChange`/`setRect`/`getRect`/`loadRect`.

## Current environment state

- Python 3.11 venv at `ImageApp/venv/`, dependencies in `requirements.txt` (Flask, Pillow, piexif,
  python-dotenv, waitress, onnxruntime, pooch, numpy — no `rembg`).
- ISNet model cached at `~/.imageapp/models/isnet-general-use.onnx` (170MB, already downloaded).
- A dev server (`python run.py`) has been running through most of this work at
  `http://127.0.0.1:5000/` with the Flask debug reloader (auto-restarts on `.py` changes; static
  JS/CSS/HTML changes just need a browser refresh).
- No automated browser UI testing was available in this environment (built-in browser can't reach
  localhost; Claude-in-Chrome tools weren't available here) — everything was verified via the
  Flask test client, direct HTTP requests against the live server, and static
  cross-checks (every `getElementById` reference checked against the HTML, all JS syntax-checked
  with `node --check`). The interactive crop-box dragging in particular has not been visually
  click-tested by a human yet.

## Suggested next steps (not done, not asked for — just noted)

- Manual browser click-through of the crop tool's drag/resize handles, and of the background
  controls, since neither has had human eyes on the actual rendered interaction.
- If background-removal ghosting persists on a real photo, get that photo and tune
  `_LOW_CONFIDENCE`/`_HIGH_CONFIDENCE`/`_COMPONENT_ANALYSIS_SIZE` against it directly.
- Batch mode intentionally doesn't expose background removal/custom background image in its UI
  (kept simple per the original spec) — the API supports it per-image if that's ever wanted.
