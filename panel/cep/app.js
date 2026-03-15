(function () {
  const state = {
    activeJobId: null,
    pollTimer: null,
    healthTimer: null,
    illustratorConnected: false,
    lastEstimate: null,
    runHistory: [],
  };
  const PRESET_STORAGE_KEY = "illustrator-mcp-panel-presets-v1";

  const effectSchemas = {
    dither: [
      { key: "pixelSize", label: "pixelSize", type: "text", placeholder: "2mm" },
      {
        key: "pattern",
        label: "pattern",
        type: "select",
        options: [
          "bayer2",
          "bayer4",
          "bayer8",
          "blue-noise",
          "clustered_4x4",
          "floyd-steinberg",
          "atkinson",
          "riemersma",
          "random",
        ],
      },
      { key: "threshold", label: "threshold", type: "number", min: 0, max: 1, step: 0.01, placeholder: "0.5" },
      { key: "invert", label: "invert", type: "checkbox" },
      { key: "maxTiles", label: "maxTiles", type: "number", min: 100, max: 100000, step: 1, placeholder: "40000" },
      {
        key: "colorMode",
        label: "colorMode",
        type: "select",
        options: ["mono", "rgb"],
      },
    ],
    halftone: [
      { key: "dotSpacing", label: "dotSpacing", type: "text", placeholder: "2mm" },
      { key: "minDotSize", label: "minDotSize", type: "text", placeholder: "0.2mm" },
      { key: "maxDotSize", label: "maxDotSize", type: "text", placeholder: "1.6mm" },
      { key: "angleDeg", label: "angleDeg", type: "number", step: 1, placeholder: "45" },
      { key: "maxDots", label: "maxDots", type: "number", min: 100, max: 100000, step: 1, placeholder: "2500" },
    ],
    mosaic: [
      { key: "tileSize", label: "tileSize", type: "text", placeholder: "3mm" },
      { key: "gap", label: "gap", type: "text", placeholder: "0mm" },
      { key: "cornerRadius", label: "cornerRadius", type: "text", placeholder: "0mm" },
      { key: "maxTiles", label: "maxTiles", type: "number", min: 100, max: 100000, step: 1, placeholder: "20000" },
      { key: "grayscale", label: "grayscale", type: "checkbox" },
    ],
  };

  const el = {
    bridgeBaseUrl: document.getElementById("bridgeBaseUrl"),
    connectionHint: document.getElementById("connectionHint"),
    healthBtn: document.getElementById("healthBtn"),
    targetUuid: document.getElementById("targetUuid"),
    selectedUuidBtn: document.getElementById("selectedUuidBtn"),
    effectSelect: document.getElementById("effectSelect"),
    groupName: document.getElementById("groupName"),
    presetName: document.getElementById("presetName"),
    presetSelect: document.getElementById("presetSelect"),
    savePresetBtn: document.getElementById("savePresetBtn"),
    loadPresetBtn: document.getElementById("loadPresetBtn"),
    deletePresetBtn: document.getElementById("deletePresetBtn"),
    paramsContainer: document.getElementById("paramsContainer"),
    riskBadge: document.getElementById("riskBadge"),
    estimatedShapes: document.getElementById("estimatedShapes"),
    jobStatus: document.getElementById("jobStatus"),
    hintsList: document.getElementById("hintsList"),
    riskWarning: document.getElementById("riskWarning"),
    applySafeBtn: document.getElementById("applySafeBtn"),
    historyList: document.getElementById("historyList"),
    exportPath: document.getElementById("exportPath"),
    exportFormat: document.getElementById("exportFormat"),
    exportBtn: document.getElementById("exportBtn"),
    lastResult: document.getElementById("lastResult"),
    estimateBtn: document.getElementById("estimateBtn"),
    previewBtn: document.getElementById("previewBtn"),
    runBtn: document.getElementById("runBtn"),
    cancelBtn: document.getElementById("cancelBtn"),
  };

  const baseUrl = () => (el.bridgeBaseUrl.value || "").trim().replace(/\/+$/, "");

  const setStatus = (text) => {
    el.jobStatus.textContent = text;
  };

  const setActionButtonsEnabled = (enabled) => {
    el.estimateBtn.disabled = !enabled;
    el.previewBtn.disabled = !enabled;
    el.runBtn.disabled = !enabled;
    el.cancelBtn.disabled = !enabled;
    el.applySafeBtn.disabled = !enabled;
    el.exportBtn.disabled = !enabled;
  };

  const loadPresetStore = () => {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }
      return parsed;
    } catch (_) {
      return {};
    }
  };

  const savePresetStore = (store) => {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(store));
  };

  const getPresetKey = (effect, name) => `${effect}::${name}`;

  const listPresetNamesForEffect = (effect) => {
    const store = loadPresetStore();
    return Object.keys(store)
      .filter((key) => key.startsWith(effect + "::"))
      .map((key) => key.split("::")[1])
      .sort((a, b) => a.localeCompare(b));
  };

  const setRisk = (risk) => {
    el.riskBadge.className = "badge " + (risk || "neutral");
    el.riskBadge.textContent = risk || "unknown";
  };

  const renderHints = (hints) => {
    el.hintsList.innerHTML = "";
    (hints || []).forEach((hint) => {
      const li = document.createElement("li");
      li.textContent = hint;
      el.hintsList.appendChild(li);
    });
  };

  const updateRiskWarning = (risk) => {
    if (risk === "high") {
      el.riskWarning.textContent =
        "High risk: Illustrator may freeze. Use Apply Safe Params or Preview first.";
      return;
    }
    if (risk === "medium") {
      el.riskWarning.textContent =
        "Medium risk: Preview recommended before final run.";
      return;
    }
    if (risk === "low") {
      el.riskWarning.textContent = "Low risk: Final run is usually stable.";
      return;
    }
    el.riskWarning.textContent = "Estimate to see warnings.";
  };

  const renderHistory = () => {
    el.historyList.innerHTML = "";
    if (state.runHistory.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No runs yet.";
      el.historyList.appendChild(li);
      return;
    }
    state.runHistory.forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.at} | ${entry.effect} | ${entry.status} | ${entry.count ?? "-"}`;
      el.historyList.appendChild(li);
    });
  };

  const parseInputValue = (input) => {
    if (input.type === "checkbox") {
      return input.checked;
    }
    if (input.type === "number") {
      if (input.value === "") {
        return undefined;
      }
      return Number(input.value);
    }
    if (input.value === "") {
      return undefined;
    }
    return input.value;
  };

  const collectParams = () => {
    const params = {};
    const inputs = el.paramsContainer.querySelectorAll("input, select");
    inputs.forEach((input) => {
      const key = input.dataset.key;
      const value = parseInputValue(input);
      if (value !== undefined) {
        params[key] = value;
      }
    });
    if (el.groupName.value.trim()) {
      params.groupName = el.groupName.value.trim();
    }
    return params;
  };

  const renderParams = () => {
    const schema = effectSchemas[el.effectSelect.value];
    const wrapper = document.createElement("div");
    wrapper.className = "param-grid";
    schema.forEach((field) => {
      const row = document.createElement("div");
      row.className = "param-item";
      const label = document.createElement("label");
      label.textContent = field.label;
      label.htmlFor = "param-" + field.key;
      let input;
      if (field.type === "select") {
        input = document.createElement("select");
        field.options.forEach((v) => {
          const option = document.createElement("option");
          option.value = v;
          option.textContent = v;
          input.appendChild(option);
        });
      } else {
        input = document.createElement("input");
        input.type = field.type;
        if (field.placeholder) input.placeholder = field.placeholder;
        if (field.min !== undefined) input.min = String(field.min);
        if (field.max !== undefined) input.max = String(field.max);
        if (field.step !== undefined) input.step = String(field.step);
      }
      input.id = "param-" + field.key;
      input.dataset.key = field.key;
      row.appendChild(label);
      row.appendChild(input);
      wrapper.appendChild(row);
    });
    el.paramsContainer.innerHTML = "";
    el.paramsContainer.appendChild(wrapper);
  };

  const setParamValue = (key, value) => {
    const input = el.paramsContainer.querySelector('[data-key="' + key + '"]');
    if (!input) {
      if (key === "groupName" && typeof value === "string") {
        el.groupName.value = value;
      }
      return;
    }
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
      return;
    }
    input.value = value === undefined || value === null ? "" : String(value);
  };

  const renderPresetList = () => {
    const names = listPresetNamesForEffect(el.effectSelect.value);
    el.presetSelect.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = names.length === 0 ? "(no presets)" : "(select preset)";
    el.presetSelect.appendChild(empty);
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      el.presetSelect.appendChild(option);
    });
  };

  const savePreset = () => {
    const name = el.presetName.value.trim();
    if (!name) {
      el.lastResult.textContent = "Preset name is required.";
      return;
    }
    const effect = el.effectSelect.value;
    const store = loadPresetStore();
    store[getPresetKey(effect, name)] = {
      effect,
      params: collectParams(),
      groupName: el.groupName.value.trim(),
      savedAt: new Date().toISOString(),
    };
    savePresetStore(store);
    renderPresetList();
    el.presetSelect.value = name;
    setStatus("preset-saved");
  };

  const loadPreset = () => {
    const name = el.presetSelect.value || el.presetName.value.trim();
    if (!name) {
      el.lastResult.textContent = "Select a preset to load.";
      return;
    }
    const effect = el.effectSelect.value;
    const store = loadPresetStore();
    const entry = store[getPresetKey(effect, name)];
    if (!entry) {
      el.lastResult.textContent = "Preset not found.";
      return;
    }
    Object.keys(entry.params || {}).forEach((key) => setParamValue(key, entry.params[key]));
    if (typeof entry.groupName === "string") {
      el.groupName.value = entry.groupName;
    }
    el.presetName.value = name;
    setStatus("preset-loaded");
  };

  const deletePreset = () => {
    const name = el.presetSelect.value || el.presetName.value.trim();
    if (!name) {
      el.lastResult.textContent = "Select a preset to delete.";
      return;
    }
    const effect = el.effectSelect.value;
    const store = loadPresetStore();
    const key = getPresetKey(effect, name);
    if (!store[key]) {
      el.lastResult.textContent = "Preset not found.";
      return;
    }
    delete store[key];
    savePresetStore(store);
    renderPresetList();
    el.presetName.value = "";
    setStatus("preset-deleted");
  };

  const applySafeParams = () => {
    if (!state.lastEstimate || !state.lastEstimate.safeParams) {
      el.lastResult.textContent = "Run Estimate first to get safe params.";
      return;
    }
    const safeParams = state.lastEstimate.safeParams;
    Object.keys(safeParams).forEach((key) => {
      setParamValue(key, safeParams[key]);
    });
    setStatus("safe-params-applied");
  };

  const requestJson = async (path, method, body) => {
    const response = await fetch(baseUrl() + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Request failed");
    }
    return payload;
  };

  const runEstimate = async () => {
    setStatus("estimating");
    try {
      const payload = await requestJson("/estimate", "POST", {
        effect: el.effectSelect.value,
        targetUuid: el.targetUuid.value.trim(),
        params: collectParams(),
      });
      state.lastEstimate = payload;
      el.estimatedShapes.textContent = String(payload.estimatedShapes);
      setRisk(payload.risk);
      updateRiskWarning(payload.risk);
      renderHints(payload.hints);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      el.lastResult.textContent = String(error.message || error);
    }
  };

  const pollJob = async (jobId) => {
    try {
      const payload = await requestJson("/jobs/" + jobId, "GET");
      setStatus(payload.status);
      if (payload.status === "done" || payload.status === "error" || payload.status === "cancelled") {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        state.activeJobId = null;
        if (payload.status === "done") {
          state.runHistory.unshift({
            at: new Date().toLocaleTimeString(),
            effect: payload.effect,
            status: payload.status,
            groupUuid: payload.result ? payload.result.groupUuid : undefined,
            count: payload.result ? payload.result.count : undefined,
          });
        } else {
          state.runHistory.unshift({
            at: new Date().toLocaleTimeString(),
            effect: payload.effect,
            status: payload.status,
            groupUuid: undefined,
            count: undefined,
          });
        }
        state.runHistory = state.runHistory.slice(0, 5);
        renderHistory();
        el.lastResult.textContent = JSON.stringify(payload, null, 2);
      }
    } catch (error) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
      state.activeJobId = null;
      setStatus("error");
      el.lastResult.textContent = String(error.message || error);
    }
  };

  const runJob = async (isPreview) => {
    const runType = isPreview ? "preview" : "run";
    if (!el.targetUuid.value.trim()) {
      setStatus("error");
      el.lastResult.textContent = "Target UUID is required.";
      return;
    }
    if (!isPreview && state.lastEstimate && state.lastEstimate.risk === "high") {
      const ok = window.confirm("Risk is HIGH. Illustrator may freeze. Continue?");
      if (!ok) {
        return;
      }
    }
    setStatus(isPreview ? "preview-running" : "running");
    try {
      const payload = await requestJson("/" + runType, "POST", {
        effect: el.effectSelect.value,
        targetUuid: el.targetUuid.value.trim(),
        params: collectParams(),
      });
      state.activeJobId = payload.jobId;
      if (state.pollTimer) {
        clearInterval(state.pollTimer);
      }
      state.pollTimer = setInterval(() => {
        pollJob(payload.jobId);
      }, 1000);
      await pollJob(payload.jobId);
    } catch (error) {
      setStatus("error");
      el.lastResult.textContent = String(error.message || error);
    }
  };

  const getLatestGroupUuid = () => {
    if (state.runHistory.length > 0 && state.runHistory[0].groupUuid) {
      return state.runHistory[0].groupUuid;
    }
    const match = /"groupUuid"\s*:\s*"([^"]+)"/.exec(el.lastResult.textContent || "");
    return match ? match[1] : null;
  };

  const exportSelected = async () => {
    const path = el.exportPath.value.trim();
    if (!path) {
      setStatus("error");
      el.lastResult.textContent = "Export path is required.";
      return;
    }
    const uuid = getLatestGroupUuid();
    if (!uuid) {
      setStatus("error");
      el.lastResult.textContent =
        "No groupUuid found. Run an effect first, then export the latest result.";
      return;
    }

    setStatus("exporting");
    try {
      const payload = await requestJson("/export/selection", "POST", {
        uuids: [uuid],
        path,
        format: el.exportFormat.value,
      });
      setStatus("exported");
      el.lastResult.textContent = JSON.stringify(payload, null, 2);
    } catch (error) {
      setStatus("error");
      el.lastResult.textContent = String(error.message || error);
    }
  };

  const cancelJob = async () => {
    if (!state.activeJobId) {
      return;
    }
    try {
      await requestJson("/jobs/" + state.activeJobId + "/cancel", "POST");
      setStatus("cancel-requested");
    } catch (error) {
      setStatus("error");
      el.lastResult.textContent = String(error.message || error);
    }
  };

  const healthCheck = async (silent = false) => {
    if (!silent) {
      setStatus("health-check");
    }
    try {
      const payload = await requestJson("/health", "GET");
      state.illustratorConnected = Boolean(payload.illustrator && payload.illustrator.connected);
      setActionButtonsEnabled(state.illustratorConnected);
      setStatus(state.illustratorConnected ? "ready" : "bridge-ok-illustrator-ng");
      el.connectionHint.textContent = state.illustratorConnected
        ? "Bridge and Illustrator connected."
        : "Bridge reachable, Illustrator not connected.";
      if (!silent) {
        el.lastResult.textContent = JSON.stringify(payload, null, 2);
      }
    } catch (error) {
      state.illustratorConnected = false;
      setActionButtonsEnabled(false);
      setStatus("error");
      el.connectionHint.textContent = "Bridge not reachable. Start bridge and retry.";
      if (!silent) {
        el.lastResult.textContent = String(error.message || error);
      }
    }
  };

  const useSelectedUuid = async () => {
    setStatus("fetch-selected");
    try {
      const payload = await requestJson("/targets/selected", "GET");
      if (!payload.selectedUuid) {
        setStatus("no-selection");
        el.lastResult.textContent =
          "No selected placed image found. Select one image in Illustrator and retry.";
        return;
      }
      el.targetUuid.value = payload.selectedUuid;
      setStatus("selected-uuid-set");
      el.lastResult.textContent = JSON.stringify(payload, null, 2);
    } catch (error) {
      setStatus("error");
      el.lastResult.textContent = String(error.message || error);
    }
  };

  el.effectSelect.addEventListener("change", () => {
    renderParams();
    renderPresetList();
    setRisk("neutral");
    updateRiskWarning(null);
    el.estimatedShapes.textContent = "-";
    renderHints([]);
    state.lastEstimate = null;
  });
  el.estimateBtn.addEventListener("click", runEstimate);
  el.previewBtn.addEventListener("click", () => runJob(true));
  el.runBtn.addEventListener("click", () => runJob(false));
  el.cancelBtn.addEventListener("click", cancelJob);
  el.healthBtn.addEventListener("click", () => healthCheck(false));
  el.selectedUuidBtn.addEventListener("click", useSelectedUuid);
  el.applySafeBtn.addEventListener("click", applySafeParams);
  el.savePresetBtn.addEventListener("click", savePreset);
  el.loadPresetBtn.addEventListener("click", loadPreset);
  el.deletePresetBtn.addEventListener("click", deletePreset);
  el.exportBtn.addEventListener("click", exportSelected);
  el.presetSelect.addEventListener("change", () => {
    el.presetName.value = el.presetSelect.value;
  });

  renderParams();
  renderPresetList();
  renderHistory();
  setActionButtonsEnabled(false);
  healthCheck(true);
  state.healthTimer = setInterval(() => {
    healthCheck(true);
  }, 5000);
})();
