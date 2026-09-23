const DropZone = (() => {
  function bind(zoneEl, inputEl, browseBtnEl, onFiles) {
    browseBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      inputEl.click();
    });
    zoneEl.addEventListener("click", (e) => {
      if (e.target === zoneEl || (zoneEl.contains(e.target) && !e.target.closest("button"))) {
        inputEl.click();
      }
    });
    inputEl.addEventListener("change", () => {
      if (inputEl.files.length) onFiles(Array.from(inputEl.files));
      inputEl.value = "";
    });
    ["dragenter", "dragover"].forEach((evt) =>
      zoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        zoneEl.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      zoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        zoneEl.classList.remove("dragover");
      })
    );
    zoneEl.addEventListener("drop", (e) => {
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) onFiles(files);
    });
  }

  return { bind };
})();
