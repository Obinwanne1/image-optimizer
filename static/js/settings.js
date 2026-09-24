const SettingsPanel = (() => {
  // ---- Elements: DOM refs only, no behavior --------------------------------
  const els = {
    formatSelect: document.getElementById("format-select"),
    qualitySlider: document.getElementById("quality-slider"),
    qualityValue: document.getElementById("quality-value"),
    brightnessSlider: document.getElementById("brightness-slider"),
    brightnessValue: document.getElementById("brightness-value"),
    contrastSlider: document.getElementById("contrast-slider"),
    contrastValue: document.getElementById("contrast-value"),
    saturationSlider: document.getElementById("saturation-slider"),
    saturationValue: document.getElementById("saturation-value"),
    exposureSlider: document.getElementById("exposure-slider"),
    exposureValue: document.getElementById("exposure-value"),
    grayscaleCheck: document.getElementById("grayscale-check"),
    sharpenSlider: document.getElementById("sharpen-slider"),
    sharpenValue: document.getElementById("sharpen-value"),
    sharpenRadiusSlider: document.getElementById("sharpen-radius-slider"),
    sharpenRadiusValue: document.getElementById("sharpen-radius-value"),
    blurSlider: document.getElementById("blur-slider"),
    blurValue: document.getElementById("blur-value"),
    resizeModeSelect: document.getElementById("resize-mode-select"),
    resizePercentageGroup: document.getElementById("resize-percentage-group"),
    resizePercentageSlider: document.getElementById("resize-percentage-slider"),
    resizePercentageValue: document.getElementById("resize-percentage-value"),
    resizeDimsGroup: document.getElementById("resize-dims-group"),
    resizeWidthInput: document.getElementById("resize-width-input"),
    resizeHeightInput: document.getElementById("resize-height-input"),
    maintainAspectCheck: document.getElementById("maintain-aspect-check"),
    presetDimsGroup: document.getElementById("preset-dims-group"),
    resizeCropGroup: document.getElementById("resize-crop-group"),
    cropXInput: document.getElementById("crop-x-input"),
    cropYInput: document.getElementById("crop-y-input"),
    cropWidthInput: document.getElementById("crop-width-input"),
    cropHeightInput: document.getElementById("crop-height-input"),
    cropResetBtn: document.getElementById("crop-reset-btn"),
    originalDimsReadout: document.getElementById("original-dims-readout"),
    resultDimsReadout: document.getElementById("result-dims-readout"),
    stripMetadataCheck: document.getElementById("strip-metadata-check"),
    progressiveCheck: document.getElementById("progressive-check"),
    losslessCheck: document.getElementById("lossless-check"),
    webpMethodGroup: document.getElementById("webp-method-group"),
    webpMethodSlider: document.getElementById("webp-method-slider"),
    webpMethodValue: document.getElementById("webp-method-value"),
    presetSelect: document.getElementById("preset-select"),
    rotateLeftBtn: document.getElementById("rotate-left-btn"),
    rotateRightBtn: document.getElementById("rotate-right-btn"),
    flipHBtn: document.getElementById("flip-h-btn"),
    flipVBtn: document.getElementById("flip-v-btn"),
    removeBackgroundCheck: document.getElementById("remove-background-check"),
    backgroundFillGroup: document.getElementById("background-fill-group"),
    backgroundModeSelect: document.getElementById("background-mode-select"),
    backgroundColorGroup: document.getElementById("background-color-group"),
    backgroundColorInput: document.getElementById("background-color-input"),
    backgroundImageUploadGroup: document.getElementById("background-image-upload-group"),
    backgroundImageInput: document.getElementById("background-image-input"),
    backgroundImageBrowseBtn: document.getElementById("background-image-browse-btn"),
    backgroundImageStatus: document.getElementById("background-image-status"),
    backgroundImageClearBtn: document.getElementById("background-image-clear-btn"),
  };

  let state = { rotate_degrees: 0, auto_orient: true };
  let onApplyCallback = null;
  let debounceTimer = null;
  let originalDims = { width: 0, height: 0 };
  let suppressEvents = false;
  let backgroundImageSelectedCallback = null;
  let backgroundImageClearCallback = null;

  // ---- Codec: pure two-way mapping between `els` and a settings object ----
  // No event wiring and no layout decisions here — only "settings object in,
  // DOM values out" and back. Kept separate from loadState()/bindEvents() so
  // the serialization rules (which field maps to which control, and how) can
  // be read/changed without wading through event-handling code.
  const Codec = {
    write(settingsDict) {
      els.formatSelect.value = settingsDict.format;
      els.qualitySlider.value = settingsDict.quality;
      els.qualityValue.textContent = settingsDict.quality + "%";
      els.brightnessSlider.value = settingsDict.brightness;
      els.brightnessValue.textContent = Number(settingsDict.brightness).toFixed(2);
      els.contrastSlider.value = settingsDict.contrast;
      els.contrastValue.textContent = Number(settingsDict.contrast).toFixed(2);
      els.saturationSlider.value = settingsDict.saturation;
      els.saturationValue.textContent = Number(settingsDict.saturation).toFixed(2);
      els.exposureSlider.value = settingsDict.exposure;
      els.exposureValue.textContent = settingsDict.exposure;
      els.grayscaleCheck.checked = settingsDict.grayscale;
      els.sharpenSlider.value = settingsDict.sharpen_amount;
      els.sharpenValue.textContent = settingsDict.sharpen_amount;
      els.sharpenRadiusSlider.value = settingsDict.sharpen_radius;
      els.sharpenRadiusValue.textContent = Number(settingsDict.sharpen_radius).toFixed(1);
      els.blurSlider.value = settingsDict.blur_amount;
      els.blurValue.textContent = settingsDict.blur_amount;

      els.resizeModeSelect.value = settingsDict.resize_mode;
      els.resizePercentageSlider.value = settingsDict.resize_percentage;
      els.resizePercentageValue.textContent = settingsDict.resize_percentage + "%";
      els.resizeWidthInput.value = settingsDict.resize_width || "";
      els.resizeHeightInput.value = settingsDict.resize_height || "";
      els.maintainAspectCheck.checked = settingsDict.maintain_aspect;
      CropTool.loadRect({
        crop_x: settingsDict.crop_x,
        crop_y: settingsDict.crop_y,
        crop_width: settingsDict.crop_width,
        crop_height: settingsDict.crop_height,
      });

      els.stripMetadataCheck.checked = settingsDict.strip_metadata;
      els.progressiveCheck.checked = settingsDict.progressive;
      els.losslessCheck.checked = settingsDict.lossless;
      els.webpMethodSlider.value = settingsDict.webp_method;
      els.webpMethodValue.textContent = settingsDict.webp_method;

      els.flipHBtn.classList.toggle("active", !!settingsDict.flip_horizontal);
      els.flipVBtn.classList.toggle("active", !!settingsDict.flip_vertical);

      els.removeBackgroundCheck.checked = !!settingsDict.remove_background;
      els.backgroundModeSelect.value = settingsDict.background_mode || "transparent";
      els.backgroundColorInput.value = settingsDict.background_color || "#ffffff";
    },

    read() {
      return {
        quality: parseInt(els.qualitySlider.value, 10),
        format: els.formatSelect.value,
        sharpen_amount: parseFloat(els.sharpenSlider.value),
        sharpen_radius: parseFloat(els.sharpenRadiusSlider.value),
        blur_amount: parseFloat(els.blurSlider.value),
        brightness: parseFloat(els.brightnessSlider.value),
        contrast: parseFloat(els.contrastSlider.value),
        saturation: parseFloat(els.saturationSlider.value),
        exposure: parseInt(els.exposureSlider.value, 10),
        grayscale: els.grayscaleCheck.checked,
        rotate_degrees: state.rotate_degrees || 0,
        flip_horizontal: els.flipHBtn.classList.contains("active"),
        flip_vertical: els.flipVBtn.classList.contains("active"),
        resize_mode: els.resizeModeSelect.value,
        resize_width: els.resizeWidthInput.value ? parseInt(els.resizeWidthInput.value, 10) : null,
        resize_height: els.resizeHeightInput.value ? parseInt(els.resizeHeightInput.value, 10) : null,
        resize_percentage: parseFloat(els.resizePercentageSlider.value),
        maintain_aspect: els.maintainAspectCheck.checked,
        crop_x: parseInt(els.cropXInput.value, 10) || 0,
        crop_y: parseInt(els.cropYInput.value, 10) || 0,
        crop_width: els.cropWidthInput.value ? parseInt(els.cropWidthInput.value, 10) : null,
        crop_height: els.cropHeightInput.value ? parseInt(els.cropHeightInput.value, 10) : null,
        strip_metadata: els.stripMetadataCheck.checked,
        progressive: els.progressiveCheck.checked,
        lossless: els.losslessCheck.checked,
        webp_method: parseInt(els.webpMethodSlider.value, 10),
        auto_orient: state.auto_orient !== undefined ? state.auto_orient : true,
        remove_background: els.removeBackgroundCheck.checked,
        background_mode: els.backgroundModeSelect.value,
        background_color: els.backgroundColorInput.value,
      };
    },
  };

  // ---- Layout: show/hide widget groups for the currently selected mode ----
  // Pure visibility/active-state toggling, no settings serialization and no
  // network/apply calls — callers decide when to invoke these and whether to
  // also schedule an apply.
  const Layout = {
    toggleResizeGroups() {
      const mode = els.resizeModeSelect.value;
      els.resizePercentageGroup.hidden = mode !== "percentage";
      els.resizeDimsGroup.hidden = mode !== "dimensions";
      els.presetDimsGroup.hidden = mode !== "dimensions";
      els.resizeCropGroup.hidden = mode !== "crop";
      if (mode === "crop") {
        CropTool.show();
        syncCropInputsFromTool();
      } else {
        CropTool.hide();
      }
    },
    toggleFormatGroups() {
      els.webpMethodGroup.hidden = els.formatSelect.value !== "WEBP";
    },
    toggleBackgroundGroups() {
      els.backgroundFillGroup.hidden = !els.removeBackgroundCheck.checked;
      const mode = els.backgroundModeSelect.value;
      els.backgroundColorGroup.hidden = mode !== "color";
      els.backgroundImageUploadGroup.hidden = mode !== "image";
    },
    syncQuickButtons() {
      document.querySelectorAll(".quick-buttons [data-quality]").forEach((btn) => {
        btn.classList.toggle("active", String(state.quality) === btn.dataset.quality);
      });
    },
  };

  function setOriginalDims(w, h) {
    originalDims = { width: w, height: h };
    els.originalDimsReadout.textContent = `${w} × ${h}`;
    CropTool.setImage(w, h);
    updateResultReadout();
  }

  // Mirrors _apply_resize()/rotate handling in app/image_processor.py — keep the rounding
  // rule (Math.round / round()) identical on both sides or this pre-apply readout will drift
  // from the actual server output by a pixel.
  function updateResultReadout() {
    if (!originalDims.width) {
      els.resultDimsReadout.textContent = "—";
      return;
    }
    const mode = els.resizeModeSelect.value;
    let w = originalDims.width;
    let h = originalDims.height;
    if (mode === "percentage") {
      const scale = parseFloat(els.resizePercentageSlider.value) / 100;
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    } else if (mode === "dimensions") {
      const tw = parseInt(els.resizeWidthInput.value, 10) || null;
      const th = parseInt(els.resizeHeightInput.value, 10) || null;
      if (els.maintainAspectCheck.checked) {
        let ratio = 1;
        if (tw && th) ratio = Math.min(tw / originalDims.width, th / originalDims.height);
        else if (tw) ratio = tw / originalDims.width;
        else if (th) ratio = th / originalDims.height;
        w = Math.max(1, Math.round(originalDims.width * ratio));
        h = Math.max(1, Math.round(originalDims.height * ratio));
      } else {
        w = tw || originalDims.width;
        h = th || originalDims.height;
      }
    } else if (mode === "crop") {
      w = parseInt(els.cropWidthInput.value, 10) || 0;
      h = parseInt(els.cropHeightInput.value, 10) || 0;
    }
    if (((state.rotate_degrees || 0) % 180) === 90) {
      [w, h] = [h, w];
    }
    els.resultDimsReadout.textContent = w && h ? `${w} × ${h}` : "—";
  }

  function syncCropInputsFromTool() {
    const r = CropTool.getRect();
    els.cropXInput.value = Math.round(r.x);
    els.cropYInput.value = Math.round(r.y);
    els.cropWidthInput.value = Math.round(r.width);
    els.cropHeightInput.value = Math.round(r.height);
  }

  function loadState(settingsDict) {
    suppressEvents = true;
    state = { ...settingsDict };

    Codec.write(state);

    Layout.toggleResizeGroups();
    Layout.toggleFormatGroups();
    Layout.toggleBackgroundGroups();
    Layout.syncQuickButtons();
    updateResultReadout();
    els.presetSelect.value = "";
    suppressEvents = false;
  }

  function getCurrentSettings() {
    return Codec.read();
  }

  function scheduleApply(immediate) {
    if (suppressEvents) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (immediate) {
      onApplyCallback && onApplyCallback(getCurrentSettings());
      return;
    }
    debounceTimer = setTimeout(() => {
      onApplyCallback && onApplyCallback(getCurrentSettings());
    }, 350);
  }

  function bindEvents() {
    const sliderBindings = [
      [els.qualitySlider, els.qualityValue, (v) => v + "%"],
      [els.brightnessSlider, els.brightnessValue, (v) => parseFloat(v).toFixed(2)],
      [els.contrastSlider, els.contrastValue, (v) => parseFloat(v).toFixed(2)],
      [els.saturationSlider, els.saturationValue, (v) => parseFloat(v).toFixed(2)],
      [els.exposureSlider, els.exposureValue, (v) => v],
      [els.sharpenSlider, els.sharpenValue, (v) => v],
      [els.sharpenRadiusSlider, els.sharpenRadiusValue, (v) => parseFloat(v).toFixed(1)],
      [els.blurSlider, els.blurValue, (v) => v],
      [els.resizePercentageSlider, els.resizePercentageValue, (v) => v + "%"],
      [els.webpMethodSlider, els.webpMethodValue, (v) => v],
    ];
    sliderBindings.forEach(([slider, label, fmt]) => {
      slider.addEventListener("input", () => {
        label.textContent = fmt(slider.value);
        if (slider === els.qualitySlider) Layout.syncQuickButtons();
        updateResultReadout();
        scheduleApply(false);
      });
    });

    els.formatSelect.addEventListener("change", () => {
      Layout.toggleFormatGroups();
      scheduleApply(true);
    });
    [els.grayscaleCheck, els.stripMetadataCheck, els.progressiveCheck, els.losslessCheck].forEach((el) => {
      el.addEventListener("change", () => scheduleApply(true));
    });
    els.maintainAspectCheck.addEventListener("change", () => {
      updateResultReadout();
      scheduleApply(true);
    });
    els.resizeWidthInput.addEventListener("input", () => {
      updateResultReadout();
      scheduleApply(false);
    });
    els.resizeHeightInput.addEventListener("input", () => {
      updateResultReadout();
      scheduleApply(false);
    });
    els.resizeModeSelect.addEventListener("change", () => {
      Layout.toggleResizeGroups();
      updateResultReadout();
      scheduleApply(true);
    });

    CropTool.onChange(() => {
      syncCropInputsFromTool();
      updateResultReadout();
      scheduleApply(true);
    });
    [els.cropXInput, els.cropYInput, els.cropWidthInput, els.cropHeightInput].forEach((input) => {
      input.addEventListener("input", () => {
        CropTool.setRect(
          {
            x: parseInt(els.cropXInput.value, 10) || 0,
            y: parseInt(els.cropYInput.value, 10) || 0,
            width: parseInt(els.cropWidthInput.value, 10) || 1,
            height: parseInt(els.cropHeightInput.value, 10) || 1,
          },
          { silent: true }
        );
        updateResultReadout();
        scheduleApply(false);
      });
    });
    els.cropResetBtn.addEventListener("click", () => CropTool.resetToFull());
    document.querySelectorAll("#crop-aspect-buttons [data-ratio]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#crop-aspect-buttons [data-ratio]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        CropTool.setAspectLock(btn.dataset.ratio ? parseFloat(btn.dataset.ratio) : null);
      });
    });

    els.removeBackgroundCheck.addEventListener("change", () => {
      Layout.toggleBackgroundGroups();
      scheduleApply(true);
    });
    els.backgroundModeSelect.addEventListener("change", () => {
      Layout.toggleBackgroundGroups();
      scheduleApply(true);
    });
    els.backgroundColorInput.addEventListener("input", () => scheduleApply(false));
    els.backgroundImageBrowseBtn.addEventListener("click", () => els.backgroundImageInput.click());
    els.backgroundImageInput.addEventListener("change", () => {
      if (els.backgroundImageInput.files.length && backgroundImageSelectedCallback) {
        backgroundImageSelectedCallback(els.backgroundImageInput.files[0]);
      }
      els.backgroundImageInput.value = "";
    });
    els.backgroundImageClearBtn.addEventListener("click", () => {
      if (backgroundImageClearCallback) backgroundImageClearCallback();
    });

    els.rotateLeftBtn.addEventListener("click", () => {
      state.rotate_degrees = ((state.rotate_degrees || 0) - 90 + 360) % 360;
      updateResultReadout();
      scheduleApply(true);
    });
    els.rotateRightBtn.addEventListener("click", () => {
      state.rotate_degrees = ((state.rotate_degrees || 0) + 90) % 360;
      updateResultReadout();
      scheduleApply(true);
    });
    els.flipHBtn.addEventListener("click", () => {
      els.flipHBtn.classList.toggle("active");
      scheduleApply(true);
    });
    els.flipVBtn.addEventListener("click", () => {
      els.flipVBtn.classList.toggle("active");
      scheduleApply(true);
    });

    document.querySelectorAll(".quick-buttons [data-quality]").forEach((btn) => {
      btn.addEventListener("click", () => {
        els.qualitySlider.value = btn.dataset.quality;
        els.qualityValue.textContent = btn.dataset.quality + "%";
        Layout.syncQuickButtons();
        scheduleApply(true);
      });
    });
    document.querySelectorAll("#preset-dims-group [data-w]").forEach((btn) => {
      btn.addEventListener("click", () => {
        els.resizeWidthInput.value = btn.dataset.w;
        els.resizeHeightInput.value = btn.dataset.h;
        updateResultReadout();
        scheduleApply(true);
      });
    });
  }

  bindEvents();

  return {
    setOriginalDims,
    loadState,
    getCurrentSettings,
    onApply(cb) {
      onApplyCallback = cb;
    },
    setPresetOptions(presets) {
      els.presetSelect.innerHTML =
        '<option value="">Custom…</option>' +
        presets.map((p) => `<option value="${p.id}" title="${p.description}">${p.name}</option>`).join("");
    },
    onPresetSelected(cb) {
      els.presetSelect.addEventListener("change", () => {
        if (els.presetSelect.value) cb(els.presetSelect.value);
      });
    },
    onBackgroundImageSelected(cb) {
      backgroundImageSelectedCallback = cb;
    },
    onBackgroundImageClear(cb) {
      backgroundImageClearCallback = cb;
    },
    setBackgroundImageStatus(filename) {
      els.backgroundImageStatus.textContent = filename ? `Using: ${filename}` : "No image uploaded — falls back to transparent.";
      els.backgroundImageClearBtn.hidden = !filename;
    },
  };
})();
