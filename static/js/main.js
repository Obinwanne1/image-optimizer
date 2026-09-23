function showToast(message, type) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type || "info"}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

let currentImageId = null;
let currentOriginalUrl = null;

function initModeTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const mode = tab.dataset.mode;
      document.getElementById("single-mode").classList.toggle("active", mode === "single");
      document.getElementById("batch-mode").classList.toggle("active", mode === "batch");
    });
  });
}

function revokeCurrentOriginal() {
  if (currentOriginalUrl) {
    URL.revokeObjectURL(currentOriginalUrl);
    currentOriginalUrl = null;
  }
}

function initSingleMode() {
  const zone = document.getElementById("upload-zone-single");
  const input = document.getElementById("file-input-single");
  const browseBtn = document.getElementById("browse-btn-single");
  const progressWrap = document.getElementById("upload-progress-single");
  const progressBar = progressWrap.querySelector(".bar");
  const editor = document.getElementById("editor");
  const filenameInput = document.getElementById("download-filename-input");

  DropZone.bind(zone, input, browseBtn, (files) => handleUpload(files[0]));

  async function handleUpload(file) {
    progressWrap.hidden = false;
    progressBar.style.width = "0%";
    const objectUrl = URL.createObjectURL(file);
    try {
      const result = await Api.uploadSingle(file, (pct) => {
        progressBar.style.width = pct + "%";
      });
      if (currentImageId) {
        Api.deleteSession(currentImageId).catch(() => {});
      }
      revokeCurrentOriginal();
      currentImageId = result.image_id;
      currentOriginalUrl = objectUrl;
      zone.hidden = true;
      editor.hidden = false;
      filenameInput.value = "";

      Preview.reset();
      Preview.setOriginal(objectUrl, { ...result.original, filename: file.name });
      SettingsPanel.setOriginalDims(result.original.width, result.original.height);
      SettingsPanel.loadState(result.settings);
      SettingsPanel.setBackgroundImageStatus(null);
      Preview.update(result);
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      showToast(err.message, "error");
    } finally {
      progressWrap.hidden = true;
    }
  }

  SettingsPanel.onApply(async (settingsDict) => {
    if (!currentImageId) return;
    Preview.setProcessing(true);
    try {
      const result = await Api.process(currentImageId, settingsDict);
      Preview.update(result);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      Preview.setProcessing(false);
    }
  });

  SettingsPanel.onBackgroundImageSelected(async (file) => {
    if (!currentImageId) return;
    Preview.setProcessing(true);
    try {
      await Api.uploadBackgroundImage(currentImageId, file);
      SettingsPanel.setBackgroundImageStatus(file.name);
      const result = await Api.process(currentImageId, SettingsPanel.getCurrentSettings());
      Preview.update(result);
      showToast("Background image uploaded.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      Preview.setProcessing(false);
    }
  });

  SettingsPanel.onBackgroundImageClear(async () => {
    if (!currentImageId) return;
    Preview.setProcessing(true);
    try {
      await Api.deleteBackgroundImage(currentImageId);
      SettingsPanel.setBackgroundImageStatus(null);
      const result = await Api.process(currentImageId, SettingsPanel.getCurrentSettings());
      Preview.update(result);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      Preview.setProcessing(false);
    }
  });

  SettingsPanel.onPresetSelected(async (presetId) => {
    if (!currentImageId) return;
    Preview.setProcessing(true);
    try {
      const result = await Api.applyPreset(presetId, currentImageId);
      SettingsPanel.loadState(result.settings);
      Preview.update(result);
      showToast("Preset applied.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      Preview.setProcessing(false);
    }
  });

  document.getElementById("auto-optimize-btn").addEventListener("click", async () => {
    if (!currentImageId) return;
    Preview.setProcessing(true);
    try {
      const result = await Api.autoOptimize(currentImageId);
      SettingsPanel.loadState(result.settings);
      Preview.update(result);
      showToast("Auto-optimized settings applied.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      Preview.setProcessing(false);
    }
  });

  document.getElementById("reset-btn").addEventListener("click", async () => {
    if (!currentImageId) return;
    Preview.setProcessing(true);
    try {
      const result = await Api.reset(currentImageId);
      SettingsPanel.loadState(result.settings);
      Preview.update(result);
      showToast("Reset to initial settings.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      Preview.setProcessing(false);
    }
  });

  document.getElementById("new-upload-btn").addEventListener("click", async () => {
    if (currentImageId) {
      try {
        await Api.deleteSession(currentImageId);
      } catch (err) {
        /* best-effort cleanup */
      }
    }
    revokeCurrentOriginal();
    currentImageId = null;
    editor.hidden = true;
    zone.hidden = false;
  });

  document.getElementById("download-btn").addEventListener("click", () => {
    if (!currentImageId) return;
    const filename = filenameInput.value.trim();
    const a = document.createElement("a");
    a.href = Api.downloadUrl(currentImageId, filename || undefined);
    a.click();
  });
}

async function loadPresets() {
  try {
    const data = await Api.presets();
    SettingsPanel.setPresetOptions(data.presets);
    BatchPanel.setPresetOptions(data.presets);
  } catch (err) {
    /* preset listing is a non-fatal enhancement */
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initModeTabs();
  initSingleMode();
  loadPresets();
});
