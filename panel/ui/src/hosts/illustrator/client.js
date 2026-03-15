const buildBaseUrl = (baseUrl) => baseUrl.replace(/\/+$/, "");

const request = async (baseUrl, path, method = "GET", body, options = {}) => {
  const res = await fetch(buildBaseUrl(baseUrl) + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });
  const payload = await res.json();
  if (!res.ok) {
    const error = new Error(payload.detail || payload.error || "Request failed");
    if (typeof payload?.code === "string") {
      error.code = payload.code;
    }
    if (typeof payload?.detail === "string") {
      error.detail = payload.detail;
    }
    throw error;
  }
  return payload;
};

export const illustratorClient = {
  health(baseUrl, options) {
    return request(baseUrl, "/health", "GET", undefined, options);
  },
  estimate(baseUrl, body) {
    return request(baseUrl, "/estimate", "POST", body);
  },
  run(baseUrl, body) {
    return request(baseUrl, "/run", "POST", body);
  },
  preview(baseUrl, body) {
    return request(baseUrl, "/preview", "POST", body);
  },
  getJob(baseUrl, jobId) {
    return request(baseUrl, `/jobs/${jobId}`);
  },
  cancelJob(baseUrl, jobId) {
    return request(baseUrl, `/jobs/${jobId}/cancel`, "POST");
  },
  getSelectedTarget(baseUrl, options) {
    return request(baseUrl, "/targets/selected", "GET", undefined, options);
  },
  getUiState(baseUrl) {
    return request(baseUrl, "/ui-state");
  },
  patchUiState(baseUrl, body) {
    return request(baseUrl, "/ui-state", "PUT", body);
  },
  listPresets(baseUrl, effect) {
    return request(baseUrl, `/presets?effect=${encodeURIComponent(effect)}`);
  },
  getPreset(baseUrl, effect, name) {
    return request(
      baseUrl,
      `/presets/${encodeURIComponent(effect)}/${encodeURIComponent(name)}`
    );
  },
  upsertPreset(baseUrl, effect, name, body) {
    return request(
      baseUrl,
      `/presets/${encodeURIComponent(effect)}/${encodeURIComponent(name)}`,
      "PUT",
      body
    );
  },
  deletePreset(baseUrl, effect, name) {
    return request(
      baseUrl,
      `/presets/${encodeURIComponent(effect)}/${encodeURIComponent(name)}`,
      "DELETE"
    );
  },
  reorderPresets(baseUrl, effect, names) {
    return request(baseUrl, "/presets/order", "PUT", {
      effect,
      names: Array.isArray(names) ? names : [],
    });
  },
  getTargetImageSize(baseUrl, targetUuid) {
    return request(baseUrl, `/targets/${encodeURIComponent(targetUuid)}/image-size`);
  },
  getTargetGeometryDebug(baseUrl, targetUuid) {
    return request(baseUrl, `/targets/${encodeURIComponent(targetUuid)}/debug-geometry`);
  },
  getItemGeometryDebug(baseUrl, itemUuid) {
    return request(baseUrl, `/items/${encodeURIComponent(itemUuid)}/debug-geometry`);
  },
  selectExportDirectory(baseUrl) {
    return request(baseUrl, "/dialogs/select-export-directory", "GET");
  },
  exportSelection(baseUrl, body) {
    return request(baseUrl, "/export/selection", "POST", body);
  },
};
