class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const Api = (() => {
  async function request(url, options = {}) {
    const opts = { ...options };
    if (opts.body && !(opts.body instanceof FormData)) {
      opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
      opts.body = JSON.stringify(opts.body);
    }
    let resp;
    try {
      resp = await fetch(url, opts);
    } catch (err) {
      throw new ApiError("Network error - could not reach the server.", "network_error", 0);
    }
    let data = null;
    try {
      data = await resp.json();
    } catch (err) {
      data = null;
    }
    if (!resp.ok) {
      const errInfo = (data && data.error) || { code: "unknown_error", message: `Request failed (${resp.status})` };
      throw new ApiError(errInfo.message, errInfo.code, resp.status);
    }
    return data;
  }

  function uploadWithProgress(url, fieldName, files, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      files.forEach((f) => formData.append(fieldName, f));
      xhr.open("POST", url);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        let data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (err) {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          const errInfo = (data && data.error) || { code: "unknown_error", message: `Upload failed (${xhr.status})` };
          reject(new ApiError(errInfo.message, errInfo.code, xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError("Network error during upload.", "network_error", 0));
      xhr.send(formData);
    });
  }

  return {
    uploadSingle(file, onProgress) {
      return uploadWithProgress("/api/upload", "file", [file], onProgress);
    },
    uploadBatch(files, onProgress) {
      return uploadWithProgress("/api/upload/batch", "files", files, onProgress);
    },
    process(imageId, settings) {
      return request(`/api/process/${imageId}`, { method: "POST", body: settings });
    },
    reset(imageId) {
      return request(`/api/reset/${imageId}`, { method: "POST" });
    },
    imageInfo(imageId) {
      return request(`/api/image-info/${imageId}`);
    },
    presets() {
      return request("/api/presets");
    },
    applyPreset(presetId, imageId) {
      return request(`/api/presets/${presetId}/apply/${imageId}`, { method: "POST" });
    },
    autoOptimize(imageId) {
      return request(`/api/auto-optimize/${imageId}`, { method: "POST" });
    },
    deleteSession(imageId) {
      return request(`/api/session/${imageId}`, { method: "DELETE" });
    },
    uploadBackgroundImage(imageId, file) {
      return uploadWithProgress(`/api/background-image/${imageId}`, "file", [file]);
    },
    deleteBackgroundImage(imageId) {
      return request(`/api/background-image/${imageId}`, { method: "DELETE" });
    },
    downloadUrl(imageId, filename) {
      return `/api/download/${imageId}` + (filename ? `?filename=${encodeURIComponent(filename)}` : "");
    },
    batchProcess(batchId, settings) {
      return request("/api/batch/process", { method: "POST", body: { batch_id: batchId, settings } });
    },
    batchStatus(batchId) {
      return request(`/api/batch/${batchId}/status`);
    },
    deleteBatch(batchId) {
      return request(`/api/session/batch/${batchId}`, { method: "DELETE" });
    },
  };
})();
