function humanSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function aspectRatioLabel(w, h) {
  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }
  const d = gcd(w, h) || 1;
  return `${w / d}:${h / d}`;
}

const Preview = (() => {
  const els = {
    originalImg: document.getElementById("original-img"),
    optimizedImg: document.getElementById("optimized-img"),
    sliderOriginalImg: document.getElementById("slider-original-img"),
    sliderOptimizedImg: document.getElementById("slider-optimized-img"),
    sliderOverlay: document.getElementById("slider-overlay"),
    sliderLine: document.getElementById("slider-line"),
    sliderRange: document.getElementById("slider-range"),
    compareSbs: document.getElementById("compare-sbs"),
    compareSlider: document.getElementById("compare-slider"),
    viewToggle: document.getElementById("view-toggle"),
    statOriginalSize: document.getElementById("stat-original-size"),
    statOptimizedSize: document.getElementById("stat-optimized-size"),
    statSaved: document.getElementById("stat-saved"),
    statDimensions: document.getElementById("stat-dimensions"),
    warningBanner: document.getElementById("warning-banner"),
    infoOriginal: document.getElementById("info-list-original"),
    infoOptimized: document.getElementById("info-list-optimized"),
    processingIndicator: document.getElementById("processing-indicator"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    zoomFit: document.getElementById("zoom-fit"),
    zoomActual: document.getElementById("zoom-actual"),
    zoomLevel: document.getElementById("zoom-level"),
  };

  let zoom = null; // null = fit to screen

  function renderInfoList(dl, fields) {
    dl.innerHTML = Object.entries(fields)
      .map(([k, v]) => `<div class="row"><dt>${k}</dt><dd>${v}</dd></div>`)
      .join("");
  }

  function setOriginal(dataUrl, info) {
    els.originalImg.src = dataUrl;
    els.sliderOriginalImg.src = dataUrl;
    renderInfoList(els.infoOriginal, {
      Filename: info.filename || "—",
      Format: info.format,
      Dimensions: `${info.width} × ${info.height}`,
      "Aspect Ratio": aspectRatioLabel(info.width, info.height),
      "Color Mode": info.has_alpha ? "RGBA (has transparency)" : "RGB",
      "File Size": humanSize(info.size_bytes),
    });
    els.statOriginalSize.textContent = humanSize(info.size_bytes);
  }

  function update(result) {
    els.optimizedImg.src = result.preview_data_url;
    els.sliderOptimizedImg.src = result.preview_data_url;
    const out = result.output;
    els.statOptimizedSize.textContent = humanSize(out.output_size_bytes);
    const savedPct = out.reduction_percent;
    els.statSaved.textContent = savedPct >= 0 ? savedPct.toFixed(1) + "%" : Math.abs(savedPct).toFixed(1) + "% larger";
    els.statDimensions.textContent = `${out.width} × ${out.height}`;

    renderInfoList(els.infoOptimized, {
      Format: out.format,
      Dimensions: `${out.width} × ${out.height}`,
      "Aspect Ratio": aspectRatioLabel(out.width, out.height),
      "File Size": humanSize(out.output_size_bytes),
      Reduction: savedPct.toFixed(1) + "%",
    });

    if (result.warnings && result.warnings.includes("transparency_flattened")) {
      els.warningBanner.hidden = false;
      els.warningBanner.textContent =
        "This image has transparency, which JPEG does not support. Transparent areas were filled with white.";
    } else {
      els.warningBanner.hidden = true;
    }
    applyZoom();
  }

  function setProcessing(isProcessing) {
    els.processingIndicator.hidden = !isProcessing;
  }

  function setView(view) {
    const isSlider = view === "slider";
    els.compareSbs.hidden = isSlider;
    els.compareSlider.hidden = !isSlider;
    [...els.viewToggle.children].forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  }

  function updateSliderPosition() {
    const pct = els.sliderRange.value;
    els.sliderOverlay.style.width = pct + "%";
    els.sliderLine.style.left = pct + "%";
  }

  function applyZoom() {
    [els.originalImg, els.optimizedImg].forEach((img) => {
      if (zoom === null) {
        img.style.width = "";
        img.style.maxWidth = "100%";
      } else {
        img.style.maxWidth = "none";
        img.style.width = zoom + "%";
      }
    });
  }

  function bindEvents() {
    els.viewToggle.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-view]");
      if (btn) setView(btn.dataset.view);
    });
    els.sliderRange.addEventListener("input", updateSliderPosition);
    els.zoomIn.addEventListener("click", () => {
      zoom = Math.min(400, (zoom || 100) + 25);
      applyZoom();
      els.zoomLevel.textContent = zoom + "%";
    });
    els.zoomOut.addEventListener("click", () => {
      zoom = Math.max(25, (zoom || 100) - 25);
      applyZoom();
      els.zoomLevel.textContent = zoom + "%";
    });
    els.zoomFit.addEventListener("click", () => {
      zoom = null;
      applyZoom();
      els.zoomLevel.textContent = "Fit";
    });
    els.zoomActual.addEventListener("click", () => {
      zoom = 100;
      applyZoom();
      els.zoomLevel.textContent = "100%";
    });
    updateSliderPosition();
  }

  bindEvents();

  return {
    setOriginal,
    update,
    setProcessing,
    setView,
    reset() {
      els.warningBanner.hidden = true;
      zoom = null;
      els.zoomLevel.textContent = "Fit";
      setView("side-by-side");
    },
  };
})();
