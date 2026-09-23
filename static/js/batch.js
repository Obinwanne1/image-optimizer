const BatchPanel = (() => {
  let batchId = null;
  let rows = {}; // key -> { objectUrl, data }
  let cachedPresets = [];

  const zone = document.getElementById("upload-zone-batch");
  const input = document.getElementById("file-input-batch");
  const browseBtn = document.getElementById("browse-btn-batch");
  const progressWrap = document.getElementById("upload-progress-batch");
  const progressBar = progressWrap.querySelector(".bar");
  const editor = document.getElementById("batch-editor");
  const tableBody = document.getElementById("batch-table-body");

  const els = {
    presetSelect: document.getElementById("batch-preset-select"),
    formatSelect: document.getElementById("batch-format-select"),
    qualitySlider: document.getElementById("batch-quality-slider"),
    qualityValue: document.getElementById("batch-quality-value"),
    stripMetadataCheck: document.getElementById("batch-strip-metadata-check"),
    applyBtn: document.getElementById("batch-apply-btn"),
    downloadZipBtn: document.getElementById("batch-download-zip-btn"),
    newBatchBtn: document.getElementById("batch-new-upload-btn"),
  };

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : s;
    return div.innerHTML;
  }

  async function handleFiles(files) {
    progressWrap.hidden = false;
    progressBar.style.width = "0%";
    try {
      const result = await Api.uploadBatch(files, (pct) => {
        progressBar.style.width = pct + "%";
      });
      batchId = result.batch_id;
      Object.values(rows).forEach((r) => r.objectUrl && URL.revokeObjectURL(r.objectUrl));
      rows = {};
      result.images.forEach((img, idx) => {
        const key = img.image_id || `error-${idx}`;
        const file = files[idx];
        rows[key] = { objectUrl: file ? URL.createObjectURL(file) : null, data: img };
      });
      renderTable();
      zone.hidden = true;
      editor.hidden = false;
      const okCount = result.images.filter((i) => i.status === "ok").length;
      showToast(`Uploaded ${okCount} of ${result.images.length} images.`, okCount === result.images.length ? "success" : "error");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      progressWrap.hidden = true;
    }
  }

  function renderTable() {
    tableBody.innerHTML = "";
    Object.entries(rows).forEach(([key, row]) => {
      const d = row.data;
      const tr = document.createElement("tr");
      const statusClass = d.status === "ok" ? "ok" : d.status === "error" ? "error" : "pending";
      const statusText = d.status === "ok" ? "Ready" : d.status === "error" ? "Error" : "Pending";
      tr.innerHTML = `
        <td>${row.objectUrl ? `<img class="thumb" src="${row.objectUrl}" alt="">` : ""}</td>
        <td>${escapeHtml(d.filename)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span>${
        d.status === "error" ? `<div class="hint">${escapeHtml(d.error && d.error.message)}</div>` : ""
      }</td>
        <td>${d.original ? humanSize(d.original.size_bytes) : "—"}</td>
        <td>${d.output ? humanSize(d.output.output_size_bytes) : "—"}</td>
        <td>${d.output ? d.output.reduction_percent.toFixed(1) + "%" : "—"}</td>
        <td>${d.status === "ok" ? '<button type="button" class="row-download">Download</button>' : ""}</td>
      `;
      if (d.status === "ok") {
        tr.querySelector(".row-download").addEventListener("click", () => {
          const a = document.createElement("a");
          a.href = Api.downloadUrl(d.image_id);
          a.click();
        });
      }
      tableBody.appendChild(tr);
    });
  }

  async function applyToAll() {
    if (!batchId) return;
    const settings = {
      format: els.formatSelect.value,
      quality: parseInt(els.qualitySlider.value, 10),
      strip_metadata: els.stripMetadataCheck.checked,
    };
    els.applyBtn.disabled = true;
    const originalLabel = els.applyBtn.textContent;
    els.applyBtn.textContent = "Applying…";
    try {
      const result = await Api.batchProcess(batchId, settings);
      result.results.forEach((r) => {
        if (rows[r.image_id]) {
          rows[r.image_id].data = { ...rows[r.image_id].data, ...r };
        }
      });
      renderTable();
      showToast("Applied settings to all images.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      els.applyBtn.disabled = false;
      els.applyBtn.textContent = originalLabel;
    }
  }

  async function downloadZip() {
    if (!batchId) return;
    els.downloadZipBtn.disabled = true;
    try {
      const resp = await fetch("/api/batch/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error((data && data.error && data.error.message) || "Failed to build ZIP.");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "optimized_images.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      els.downloadZipBtn.disabled = false;
    }
  }

  async function resetBatch() {
    if (batchId) {
      try {
        await Api.deleteBatch(batchId);
      } catch (err) {
        /* best-effort cleanup */
      }
    }
    Object.values(rows).forEach((r) => r.objectUrl && URL.revokeObjectURL(r.objectUrl));
    rows = {};
    batchId = null;
    tableBody.innerHTML = "";
    editor.hidden = true;
    zone.hidden = false;
  }

  function setPresetOptions(presets) {
    cachedPresets = presets;
    els.presetSelect.innerHTML =
      '<option value="">Custom…</option>' + presets.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  function init() {
    DropZone.bind(zone, input, browseBtn, handleFiles);
    els.qualitySlider.addEventListener("input", () => {
      els.qualityValue.textContent = els.qualitySlider.value + "%";
    });
    els.presetSelect.addEventListener("change", () => {
      const preset = cachedPresets.find((p) => p.id === els.presetSelect.value);
      if (!preset) return;
      els.formatSelect.value = preset.settings.format;
      els.qualitySlider.value = preset.settings.quality;
      els.qualityValue.textContent = preset.settings.quality + "%";
      els.stripMetadataCheck.checked = preset.settings.strip_metadata;
    });
    els.applyBtn.addEventListener("click", applyToAll);
    els.downloadZipBtn.addEventListener("click", downloadZip);
    els.newBatchBtn.addEventListener("click", resetBatch);
  }

  init();

  return { setPresetOptions };
})();
