const CropTool = (() => {
  const img = document.getElementById("original-img");
  const box = document.getElementById("crop-box");

  let natural = { width: 0, height: 0 };
  let rect = { x: 0, y: 0, width: 0, height: 0 }; // in natural (original-image) pixel coords
  let aspectLock = null; // null = free, otherwise width/height ratio
  let active = false;
  let onChangeCallback = null;
  let dragState = null;

  function clampRect() {
    if (!natural.width || !natural.height) return;
    rect.width = Math.max(10, Math.min(rect.width, natural.width));
    rect.height = Math.max(10, Math.min(rect.height, natural.height));
    rect.x = Math.max(0, Math.min(rect.x, natural.width - rect.width));
    rect.y = Math.max(0, Math.min(rect.y, natural.height - rect.height));
  }

  function displayGeometry() {
    return {
      sx: img.clientWidth / natural.width,
      sy: img.clientHeight / natural.height,
      offsetLeft: img.offsetLeft,
      offsetTop: img.offsetTop,
    };
  }

  function renderBox() {
    if (!active || !natural.width) return;
    const { sx, sy, offsetLeft, offsetTop } = displayGeometry();
    box.style.left = offsetLeft + rect.x * sx + "px";
    box.style.top = offsetTop + rect.y * sy + "px";
    box.style.width = rect.width * sx + "px";
    box.style.height = rect.height * sy + "px";
  }

  function emitChange() {
    if (onChangeCallback) {
      onChangeCallback({
        crop_x: Math.round(rect.x),
        crop_y: Math.round(rect.y),
        crop_width: Math.round(rect.width),
        crop_height: Math.round(rect.height),
      });
    }
  }

  function setRect(partial, opts) {
    rect = { ...rect, ...partial };
    clampRect();
    renderBox();
    if (!opts || !opts.silent) emitChange();
  }

  function setImage(naturalWidth, naturalHeight) {
    natural = { width: naturalWidth, height: naturalHeight };
    rect = { x: 0, y: 0, width: naturalWidth, height: naturalHeight };
  }

  function loadRect(cropState) {
    // Syncs the box to server-known settings without re-triggering an apply.
    if (cropState && cropState.crop_width && cropState.crop_height) {
      rect = {
        x: cropState.crop_x || 0,
        y: cropState.crop_y || 0,
        width: cropState.crop_width,
        height: cropState.crop_height,
      };
      clampRect();
    } else {
      rect = { x: 0, y: 0, width: natural.width, height: natural.height };
    }
    renderBox();
  }

  function show() {
    active = true;
    box.hidden = false;
    renderBox();
  }

  function hide() {
    active = false;
    box.hidden = true;
  }

  function resetToFull() {
    rect = { x: 0, y: 0, width: natural.width, height: natural.height };
    renderBox();
    emitChange();
  }

  function setAspectLock(ratio) {
    aspectLock = ratio || null;
    if (aspectLock) {
      rect.height = rect.width / aspectLock;
      clampRect();
      renderBox();
      emitChange();
    }
  }

  function toNaturalDelta(dxPx, dyPx) {
    const { sx, sy } = displayGeometry();
    return { dx: sx ? dxPx / sx : 0, dy: sy ? dyPx / sy : 0 };
  }

  function bindDrag() {
    box.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest(".crop-handle");
      box.setPointerCapture(e.pointerId);
      dragState = {
        mode: handle ? handle.dataset.handle : "move",
        startX: e.clientX,
        startY: e.clientY,
        startRect: { ...rect },
      };
      e.preventDefault();
      e.stopPropagation();
    });

    box.addEventListener("pointermove", (e) => {
      if (!dragState) return;
      const { dx, dy } = toNaturalDelta(e.clientX - dragState.startX, e.clientY - dragState.startY);
      const s = dragState.startRect;
      let r = { ...s };

      if (dragState.mode === "move") {
        r.x = s.x + dx;
        r.y = s.y + dy;
      } else {
        const m = dragState.mode;
        if (m.includes("e")) r.width = s.width + dx;
        if (m.includes("s")) r.height = s.height + dy;
        if (m.includes("w")) {
          r.x = s.x + dx;
          r.width = s.width - dx;
        }
        if (m.includes("n")) {
          r.y = s.y + dy;
          r.height = s.height - dy;
        }
        if (aspectLock) {
          if (m === "e" || m === "w") r.height = r.width / aspectLock;
          else if (m === "n" || m === "s") r.width = r.height * aspectLock;
          else r.height = r.width / aspectLock;
        }
      }
      if (r.width > 0 && r.height > 0) {
        setRect(r, { silent: true });
      }
    });

    function endDrag() {
      if (!dragState) return;
      dragState = null;
      clampRect();
      renderBox();
      emitChange();
    }
    box.addEventListener("pointerup", endDrag);
    box.addEventListener("pointercancel", endDrag);
  }

  bindDrag();
  img.addEventListener("load", () => {
    if (active) renderBox();
  });
  window.addEventListener("resize", () => {
    if (active) renderBox();
  });

  return {
    setImage,
    loadRect,
    show,
    hide,
    setRect,
    getRect: () => ({ ...rect }),
    setAspectLock,
    resetToFull,
    isActive: () => active,
    onChange(cb) {
      onChangeCallback = cb;
    },
  };
})();
