import { useEffect, useRef, useState } from "preact/hooks";
import { Pane } from "tweakpane";
import { registerCustomPlugins } from "@nakashim/tp-custom";
import { effectSchemas, parseInputValue } from "./config/effectSchema";
import { defaultExportPath, defaultWarnings, imageToVectorMessages } from "./config/messages";
import { illustratorClient } from "../../hosts/illustrator/client";
import { pollJobUntilDone } from "./lib/jobs";
import {
  buildDebugSection,
  buildExportSection,
  buildPreviewSection,
  buildRunActionsSection,
  buildSettingsConfigSection,
  buildTargetSection,
} from "./sections";

const toTimestampForName = (date = new Date()) => {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
};

const buildAutoGroupName = (effect, date = new Date()) => `${effect}_${toTimestampForName(date)}`;
const buildAutoPresetName = (effect, date = new Date()) => `preset_${effect}_${toTimestampForName(date)}`;
const buildAutoSavePointName = (fileName, effect) =>
  `history_${stripKnownExportExtension(fileName) || buildAutoGroupName(effect)}`;
const isValidSettingsTab = (value) => value === "parameters" || value === "preset" || value === "history";

const toSavePointLabelTimestamp = (date = new Date()) => {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
};

const trimPath = (value) => String(value ?? "").trim();

const stripKnownExportExtension = (fileName) =>
  String(fileName ?? "").replace(/\.(svg|pdf|png)$/i, "");

const parseStoredExportPath = (rawPath) => {
  const input = trimPath(rawPath);
  if (!input) return { directoryPath: "", fileName: "" };
  const normalized = input.replace(/[\\/]+$/, "");
  const slashIndex = normalized.lastIndexOf("/");
  const backslashIndex = normalized.lastIndexOf("\\");
  const splitIndex = Math.max(slashIndex, backslashIndex);
  if (splitIndex < 0) {
    return { directoryPath: "", fileName: stripKnownExportExtension(normalized) };
  }
  const directoryPath = normalized.slice(0, splitIndex);
  const tail = normalized.slice(splitIndex + 1);
  if (!tail || !tail.includes(".")) {
    return { directoryPath: normalized, fileName: "" };
  }
  return { directoryPath, fileName: stripKnownExportExtension(tail) };
};

const joinPath = (directoryPath, fileName) => {
  const dir = trimPath(directoryPath).replace(/[\\/]+$/, "");
  const name = trimPath(fileName);
  if (!dir) return name;
  const separator = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return `${dir}${separator}${name}`;
};

const sanitizePresetParams = (source) => {
  const base = source && typeof source === "object" ? source : {};
  const { groupName: _ignored, ...rest } = base;
  return rest;
};

const createDefaultParamsByEffect = () => ({
  dither: {},
  halftone: {},
  mosaic: {},
});

const MAX_SAVE_POINTS = 10;
const AUTO_SYNC_STOP_FAILURE_THRESHOLD = 3;
const PREVIEW_ERROR_BY_CODE = {
  INPUT_BAD_REQUEST: "Request format is invalid. Check inputs and try again.",
  ILLUSTRATOR_TIMEOUT: "Processing timed out in Illustrator. Reduce processing load and run again.",
  ILLUSTRATOR_NOT_RUNNING: "Illustrator is not running. Launch Illustrator and try again.",
  ILLUSTRATOR_CONNECTION_INVALID:
    "Illustrator connection became invalid. Reconnect and try again.",
  ILLUSTRATOR_PERMISSION_DENIED:
    "Apple Events permission is required to control Illustrator.",
  INVALID_TARGET: "Selected target is invalid. Select a linked placed image and run again.",
  TARGET_NO_LINKED_FILE:
    "Selected target is invalid. Select a linked placed image and run again.",
  JOB_NOT_FOUND: "Run job was not found. Start a new run and try again.",
  ROUTE_NOT_FOUND: "Requested API route was not found.",
  METHOD_NOT_ALLOWED: "This operation is not allowed for the requested route.",
  INPUT_MISSING_EFFECT: "Effect is missing. Select an effect and try again.",
  BRIDGE_INTERNAL_ERROR: "Bridge internal error occurred. Check Debug details and try again.",
  INPUT_INVALID_REQUEST: "Invalid request parameters. Review inputs and try again.",
  INPUT_INVALID_JSON_BODY: "Invalid request body. Review inputs and try again.",
  PRESET_INVALID_PATH: "Preset path is invalid.",
  PRESET_NAME_REQUIRED: "Preset name is required.",
  PRESET_NOT_FOUND: "Preset not found. Select another preset or save it again.",
  UI_STATE_INVALID_PATCH_BODY:
    "UI state payload is invalid. Continue working and retry if needed.",
  TARGET_IMAGE_SIZE_PATH_INVALID: "Target image-size path is invalid.",
  TARGET_GEOMETRY_PATH_INVALID: "Target geometry path is invalid.",
  ITEM_GEOMETRY_PATH_INVALID: "Item geometry path is invalid.",
};
const isAutoSyncStopError = (error) => {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("adobe illustrator is not running") ||
    message.includes("connection invalid") ||
    message.includes("kAENoSuchObject".toLowerCase()) ||
    message.includes("not authorized to send apple events")
  );
};

const normalizeSavePoints = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = typeof item.id === "string" && item.id ? item.id : "";
      const label = typeof item.label === "string" && item.label ? item.label : "";
      const snapshot = item.snapshot && typeof item.snapshot === "object" ? item.snapshot : null;
      if (!id || !label || !snapshot) return null;
      return { id, label, snapshot };
    })
    .filter(Boolean)
    .slice(0, MAX_SAVE_POINTS);
};

export const ImageToVectorFeature = ({ bridgeBaseUrl, connected }) => {
  const [status, setStatus] = useState("idle");
  const [targetUuid, setTargetUuid] = useState("");
  const [autoSyncTarget, setAutoSyncTarget] = useState(true);
  const [effect, setEffect] = useState("dither");
  const [unit, setUnit] = useState("px");
  const [params, setParams] = useState({});
  const [risk, setRisk] = useState("unknown");
  const [estimatedShapes, setEstimatedShapes] = useState("-");
  const [hints, setHints] = useState([]);
  const [lastResultText, setLastResultText] = useState("No result yet.");
  const [previewErrorText, setPreviewErrorText] = useState("");
  const [lastEstimate, setLastEstimate] = useState(null);
  const [latestGroupUuid, setLatestGroupUuid] = useState(null);
  const [savePoints, setSavePoints] = useState([]);
  const [selectedSavePointIndex, setSelectedSavePointIndex] = useState(-1);
  const [savePointName, setSavePointName] = useState("");
  const [presetName, setPresetName] = useState(() => buildAutoPresetName("dither"));
  const [presetSelect, setPresetSelect] = useState("");
  const [presetNames, setPresetNames] = useState([]);
  const [settingsTab, setSettingsTab] = useState("parameters");
  const [targetExpanded, setTargetExpanded] = useState(true);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [presetExpanded, setPresetExpanded] = useState(true);
  const [parametersExpanded, setParametersExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [exportExpanded, setExportExpanded] = useState(true);
  const [exportPath, setExportPath] = useState(defaultExportPath);
  const [exportFileName, setExportFileName] = useState(() => buildAutoGroupName("dither"));
  const [exportFormat, setExportFormat] = useState("svg");
  const [copyStatus, setCopyStatus] = useState("");
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const [panelVisible, setPanelVisible] = useState(() => document.visibilityState !== "hidden");
  const targetUuidRef = useRef(targetUuid);
  const autoSyncBusyRef = useRef(false);
  const autoSyncAbortRef = useRef(null);
  const autoSyncFailureCountRef = useRef(0);
  const panelClosingRef = useRef(false);
  const panelVisibleRef = useRef(document.visibilityState !== "hidden");
  const paramsByEffectRef = useRef(createDefaultParamsByEffect());
  const savedUiStateRef = useRef(null);
  const panelHostRef = useRef(null);
  const panelSectionsRef = useRef(null);
  const panelActionsRef = useRef(null);
  const presetReorderRequestSeqRef = useRef(0);

  useEffect(() => {
    targetUuidRef.current = targetUuid;
  }, [targetUuid]);

  useEffect(() => {
    setSavePointName((prev) => {
      const nextAuto = buildAutoSavePointName(exportFileName, effect);
      if (!prev || prev.startsWith("history_")) {
        return nextAuto;
      }
      return prev;
    });
  }, [exportFileName, effect]);

  useEffect(() => {
    const handlePanelClosing = () => {
      panelClosingRef.current = true;
      if (autoSyncAbortRef.current) {
        autoSyncAbortRef.current.abort();
        autoSyncAbortRef.current = null;
      }
    };
    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== "hidden";
      setPanelVisible(visible);
      panelVisibleRef.current = visible;
      if (!visible && autoSyncAbortRef.current) {
        autoSyncAbortRef.current.abort();
        autoSyncAbortRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePanelClosing);
    window.addEventListener("beforeunload", handlePanelClosing);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePanelClosing);
      window.removeEventListener("beforeunload", handlePanelClosing);
      handlePanelClosing();
    };
  }, []);

  const schema = effectSchemas[effect];
  const warningText = defaultWarnings[risk] ?? defaultWarnings.unknown;
  const resolvePreviewErrorText = (errorLike, fallbackMessage) => {
    const code = typeof errorLike?.code === "string" ? errorLike.code : "";
    if (code && PREVIEW_ERROR_BY_CODE[code]) {
      return PREVIEW_ERROR_BY_CODE[code];
    }
    return String(fallbackMessage ?? errorLike?.message ?? errorLike ?? "Request failed");
  };
  const applyUiError = (errorLike, rawMessage) => {
    const resolvedRaw = String(rawMessage ?? errorLike?.message ?? errorLike ?? "Request failed");
    setStatus("error");
    setLastResultText(resolvedRaw);
    setPreviewErrorText(resolvePreviewErrorText(errorLike, resolvedRaw));
  };

  const applyHydratedState = (payload) => {
    const state =
      payload && typeof payload.imageToVector === "object" && payload.imageToVector
        ? payload.imageToVector
        : {};
    const nextEffect =
      typeof state.effect === "string" &&
      (state.effect === "dither" || state.effect === "mosaic" || state.effect === "halftone")
        ? state.effect
        : effect;
    const nextUnit = typeof state.unit === "string" ? state.unit : unit;
    const nextAutoSync = typeof state.autoSyncTarget === "boolean" ? state.autoSyncTarget : autoSyncTarget;
    const nextGroupName = buildAutoGroupName(nextEffect);
    const rawStoredExportPath = typeof state.exportPath === "string" ? state.exportPath : exportPath;
    const legacyExportPath = parseStoredExportPath(rawStoredExportPath);
    const nextExportPath = legacyExportPath.fileName ? legacyExportPath.directoryPath : rawStoredExportPath;
    const nextExportFileName =
      typeof state.exportFileName === "string" && state.exportFileName.trim()
        ? stripKnownExportExtension(state.exportFileName)
        : legacyExportPath.fileName || nextGroupName;
    const nextExportFormat = typeof state.exportFormat === "string" ? state.exportFormat : exportFormat;
    const nextPresetName =
      typeof state.presetName === "string" && state.presetName.trim()
        ? state.presetName
        : buildAutoPresetName(nextEffect);
    const nextPresetSelect = typeof state.presetSelect === "string" ? state.presetSelect : "";
    const nextSavePointName = typeof state.savePointName === "string" ? state.savePointName : "";
    const nextSettingsTab = isValidSettingsTab(state.settingsTab) ? state.settingsTab : "parameters";
    const nextPresetExpanded =
      payload &&
      typeof payload.ui === "object" &&
      payload.ui &&
      typeof payload.ui.folders === "object" &&
      payload.ui.folders &&
      typeof payload.ui.folders.preset === "boolean"
        ? payload.ui.folders.preset
        : true;
    const nextTargetExpanded =
      payload &&
      typeof payload.ui === "object" &&
      payload.ui &&
      typeof payload.ui.folders === "object" &&
      payload.ui.folders &&
      typeof payload.ui.folders.target === "boolean"
        ? payload.ui.folders.target
        : true;
    const nextPreviewExpanded =
      payload &&
      typeof payload.ui === "object" &&
      payload.ui &&
      typeof payload.ui.folders === "object" &&
      payload.ui.folders &&
      typeof payload.ui.folders.preview === "boolean"
        ? payload.ui.folders.preview
        : true;
    const nextParametersExpanded =
      payload &&
      typeof payload.ui === "object" &&
      payload.ui &&
      typeof payload.ui.folders === "object" &&
      payload.ui.folders &&
      typeof payload.ui.folders.parameters === "boolean"
        ? payload.ui.folders.parameters
        : true;
    const nextHistoryExpanded =
      payload &&
      typeof payload.ui === "object" &&
      payload.ui &&
      typeof payload.ui.folders === "object" &&
      payload.ui.folders &&
      typeof payload.ui.folders.history === "boolean"
        ? payload.ui.folders.history
        : true;
    const nextDebugExpanded = false;
    const nextExportExpanded =
      payload &&
      typeof payload.ui === "object" &&
      payload.ui &&
      typeof payload.ui.folders === "object" &&
      payload.ui.folders &&
      typeof payload.ui.folders.export === "boolean"
        ? payload.ui.folders.export
        : true;
    const nextSavePoints =
      payload &&
      typeof payload.ui === "object" &&
      payload.ui &&
      typeof payload.ui.savePoints === "object" &&
      payload.ui.savePoints &&
      Array.isArray(payload.ui.savePoints.imageToVector)
        ? normalizeSavePoints(payload.ui.savePoints.imageToVector)
        : savePoints;
    const nextSelectedSavePointIndex =
      payload &&
      typeof payload.ui === "object" &&
      payload.ui &&
      typeof payload.ui.savePoints === "object" &&
      payload.ui.savePoints &&
      Number.isInteger(payload.ui.savePoints.imageToVectorSelectedIndex)
        ? Math.max(
            -1,
            Math.min(
              Number(payload.ui.savePoints.imageToVectorSelectedIndex),
              Math.max(0, nextSavePoints.length - 1)
            )
          )
        : nextSavePoints.length > 0
          ? 0
          : -1;
    const rawParamsByEffect =
      state.paramsByEffect && typeof state.paramsByEffect === "object"
        ? state.paramsByEffect
        : createDefaultParamsByEffect();
    const normalizedParamsByEffect = createDefaultParamsByEffect();
    for (const key of ["dither", "mosaic", "halftone"]) {
      const v = rawParamsByEffect[key];
      normalizedParamsByEffect[key] = sanitizePresetParams(v);
    }
    const fallbackParams = sanitizePresetParams(state.params);
    const nextParams =
      Object.keys(normalizedParamsByEffect[nextEffect]).length > 0
        ? normalizedParamsByEffect[nextEffect]
        : fallbackParams;

    paramsByEffectRef.current = {
      ...normalizedParamsByEffect,
      [nextEffect]: sanitizePresetParams(nextParams),
    };

    setEffect(nextEffect);
    setUnit(nextUnit);
    setAutoSyncTarget(nextAutoSync);
    setExportPath(nextExportPath);
    setExportFileName(nextExportFileName);
    setExportFormat(nextExportFormat);
    setPresetName(nextPresetName);
    setPresetSelect(nextPresetSelect);
    setSavePointName(nextSavePointName);
    setSettingsTab(nextSettingsTab);
    setTargetExpanded(nextTargetExpanded);
    setPreviewExpanded(nextPreviewExpanded);
    setPresetExpanded(nextPresetExpanded);
    setParametersExpanded(nextParametersExpanded);
    setHistoryExpanded(nextHistoryExpanded);
    setDebugExpanded(nextDebugExpanded);
    setExportExpanded(nextExportExpanded);
    setSavePoints(nextSavePoints);
    setSelectedSavePointIndex(nextSelectedSavePointIndex);
    setParams(sanitizePresetParams(nextParams));
  };

  const handleEffectChange = (next) => {
    const nextMap = {
      ...paramsByEffectRef.current,
      [effect]: sanitizePresetParams(params),
    };
    paramsByEffectRef.current = nextMap;
    setEffect(next);
    setExportFileName(buildAutoGroupName(next));
    setPresetName(buildAutoPresetName(next));
    setParams(sanitizePresetParams(nextMap[next] ?? {}));
    setRisk("unknown");
    setEstimatedShapes("-");
    setHints([]);
    setLastEstimate(null);
  };

  const handleParamChange = (key, value) => {
    const field = schema.find((item) => item.key === key);
    if (!field) return;
    const parsed = parseInputValue(field, value, unit);
    setParams((prev) => {
      if (Object.is(prev[key], parsed)) return prev;
      const nextParams = {
        ...prev,
        [key]: parsed,
      };
      paramsByEffectRef.current = {
        ...paramsByEffectRef.current,
        [effect]: sanitizePresetParams(nextParams),
      };
      return nextParams;
    });
  };

  const collectParams = () => {
    const out = { ...params };
    const resolvedGroupName = String(exportFileName ?? "").trim() || buildAutoGroupName(effect);
    if (resolvedGroupName) {
      out.groupName = resolvedGroupName;
    }
    return out;
  };

  const runEstimate = async () => {
    setStatus("estimating");
    try {
      const payload = await illustratorClient.estimate(bridgeBaseUrl, {
        effect,
        targetUuid: targetUuid.trim(),
        params: collectParams(),
      });
      setLastEstimate(payload);
      setRisk(payload.risk ?? "unknown");
      setEstimatedShapes(String(payload.estimatedShapes ?? "-"));
      setHints(payload.hints ?? []);
      setStatus("ready");
    } catch (error) {
      applyUiError(error);
    }
  };

  const runJob = async () => {
    if (!targetUuid.trim()) {
      applyUiError("Target UUID is required.", "Target UUID is required.");
      return;
    }
    if (risk === "high") {
      const ok = window.confirm("Risk is HIGH. Illustrator may freeze. Continue?");
      if (!ok) return;
    }
    setStatus("running");
    try {
      const payload = await illustratorClient.run(bridgeBaseUrl, {
        effect,
        targetUuid: targetUuid.trim(),
        params: collectParams(),
      });
      await pollJobUntilDone({
        jobId: payload.jobId,
        getJob: (jobId) => illustratorClient.getJob(bridgeBaseUrl, jobId),
        onTick: (jobPayload) => {
          setStatus(jobPayload.status);
        },
        onDone: (jobPayload) => {
          setLastResultText(JSON.stringify(jobPayload, null, 2));
          if (jobPayload?.status === "error") {
            const mapped = resolvePreviewErrorText(jobPayload?.error, jobPayload?.error?.message);
            setPreviewErrorText(mapped);
          }
          const nextGroupUuid = typeof jobPayload?.result?.groupUuid === "string" ? jobPayload.result.groupUuid : null;
          setLatestGroupUuid(nextGroupUuid);
        },
        onError: (error) => {
          applyUiError(error);
        },
      });
    } catch (error) {
      applyUiError(error);
    }
  };

  const useSelected = async () => {
    setStatus("fetch-selected");
    try {
      const payload = await illustratorClient.getSelectedTarget(bridgeBaseUrl);
      if (!payload.selectedUuid) {
        setStatus("no-selection");
        setLastResultText(imageToVectorMessages.noSelection);
        return;
      }
      setTargetUuid(payload.selectedUuid);
      setStatus("selected-uuid-set");
      setLastResultText(JSON.stringify(payload, null, 2));
    } catch (error) {
      applyUiError(error);
    }
  };

  const clearTargetUuid = () => {
    setTargetUuid("");
    setStatus("target-cleared");
    setLastResultText("Target UUID cleared.");
  };

  useEffect(() => {
    if (!autoSyncTarget || !connected || !panelVisible) return undefined;
    let active = true;

    const syncSelectedTarget = async () => {
      if (!active || panelClosingRef.current || !panelVisibleRef.current || autoSyncBusyRef.current) return;
      autoSyncBusyRef.current = true;
      const controller = new AbortController();
      autoSyncAbortRef.current = controller;
      try {
        const payload = await illustratorClient.getSelectedTarget(bridgeBaseUrl, {
          signal: controller.signal,
        });
        if (!active) return;
        autoSyncFailureCountRef.current = 0;
        const nextUuid = payload.selectedUuid ?? "";
        if (nextUuid && nextUuid !== targetUuidRef.current) {
          setTargetUuid(nextUuid);
          setStatus("selected-uuid-set");
        }
      } catch (error) {
        if (error?.name === "AbortError") return;
        if (isAutoSyncStopError(error)) {
          autoSyncFailureCountRef.current += 1;
          if (autoSyncFailureCountRef.current >= AUTO_SYNC_STOP_FAILURE_THRESHOLD) {
            setAutoSyncTarget(false);
            setLastResultText("Target Auto Sync paused because Illustrator is unavailable.");
            autoSyncFailureCountRef.current = 0;
          }
          return;
        }
        // Keep auto-sync silent on transient bridge/selection errors.
      } finally {
        if (autoSyncAbortRef.current === controller) {
          autoSyncAbortRef.current = null;
        }
        autoSyncBusyRef.current = false;
      }
    };

    syncSelectedTarget();
    const timer = setInterval(syncSelectedTarget, 800);
    return () => {
      active = false;
      clearInterval(timer);
      autoSyncFailureCountRef.current = 0;
      if (autoSyncAbortRef.current) {
        autoSyncAbortRef.current.abort();
        autoSyncAbortRef.current = null;
      }
    };
  }, [autoSyncTarget, bridgeBaseUrl, connected, panelVisible]);

  useEffect(() => {
    let active = true;
    const hydrateUiState = async () => {
      try {
        const payload = await illustratorClient.getUiState(bridgeBaseUrl);
        if (!active) return;
        savedUiStateRef.current = payload;
        applyHydratedState(payload);
      } catch {
        // UI state restore is best-effort.
      } finally {
        if (active) setUiStateHydrated(true);
      }
    };
    void hydrateUiState();
    return () => {
      active = false;
    };
  }, [bridgeBaseUrl]);

  useEffect(() => {
    if (!uiStateHydrated) return undefined;
    const paramsMap = {
      ...paramsByEffectRef.current,
      [effect]: sanitizePresetParams(params),
    };
    paramsByEffectRef.current = paramsMap;
    const timer = setTimeout(() => {
      const patchPayload = {
        imageToVector: {
          unit,
          autoSyncTarget,
          effect,
          params: sanitizePresetParams(params),
          paramsByEffect: paramsMap,
          exportPath,
          exportFileName: stripKnownExportExtension(exportFileName),
          exportFormat,
          presetName,
          presetSelect,
          savePointName,
          settingsTab,
        },
        ui: {
          folders: {
            target: targetExpanded,
            preview: previewExpanded,
            preset: presetExpanded,
            parameters: parametersExpanded,
            history: historyExpanded,
            debug: false,
            export: exportExpanded,
          },
        },
      };
      void (async () => {
        try {
          const persisted = await illustratorClient.patchUiState(bridgeBaseUrl, patchPayload);
          savedUiStateRef.current = persisted;
        } catch {
          // UI state save is best-effort.
        }
      })();
    }, 500);
    return () => clearTimeout(timer);
  }, [
    autoSyncTarget,
    bridgeBaseUrl,
    effect,
    exportExpanded,
    exportFileName,
    exportFormat,
    exportPath,
    debugExpanded,
    params,
    parametersExpanded,
    historyExpanded,
    previewExpanded,
    presetExpanded,
    presetName,
    presetSelect,
    savePointName,
    settingsTab,
    targetExpanded,
    uiStateHydrated,
    unit,
  ]);

  useEffect(() => {
    let active = true;
    const refreshPresetNames = async () => {
      try {
        const payload = await illustratorClient.listPresets(bridgeBaseUrl, effect);
        if (!active) return;
        const names = Array.isArray(payload.names) ? payload.names : [];
        setPresetNames(names);
      } catch {
        if (!active) return;
        setPresetNames([]);
      }
    };
    void refreshPresetNames();
    return () => {
      active = false;
    };
  }, [bridgeBaseUrl, effect]);

  const applySafeParams = () => {
    if (!lastEstimate?.safeParams) {
      setLastResultText("Run Estimate first to get safe params.");
      return;
    }
    setParams((prev) => {
      const nextParams = { ...prev, ...lastEstimate.safeParams };
      paramsByEffectRef.current = {
        ...paramsByEffectRef.current,
        [effect]: sanitizePresetParams(nextParams),
      };
      return nextParams;
    });
    setStatus("safe-params-applied");
  };

  const savePreset = async () => {
    if (!presetName.trim()) {
      setLastResultText("Preset name is required.");
      return;
    }
    const name = presetName.trim();
    const hasSameName = presetNames.some((item) => item === name);
    if (hasSameName) {
      const confirmed =
        typeof window === "undefined" || typeof window.confirm !== "function"
          ? true
          : window.confirm(`Preset "${name}" already exists. Overwrite it?`);
      if (!confirmed) {
        setLastResultText("Preset overwrite was canceled.");
        return;
      }
    }
    try {
      await illustratorClient.upsertPreset(bridgeBaseUrl, effect, name, {
        params: sanitizePresetParams(params),
        groupName: exportFileName.trim() || undefined,
      });
      const listPayload = await illustratorClient.listPresets(bridgeBaseUrl, effect);
      const names = Array.isArray(listPayload.names) ? listPayload.names : [];
      setPresetNames(names);
      setStatus("preset-saved");
      setPresetSelect(name);
      setPresetName(name);
    } catch (error) {
      applyUiError(error);
    }
  };

  const loadPreset = async () => {
    const name = presetSelect.trim();
    if (!name) {
      setLastResultText("Select a preset to load.");
      return;
    }
    try {
      const payload = await illustratorClient.getPreset(bridgeBaseUrl, effect, name);
      const preset = payload.preset;
      const nextParams = sanitizePresetParams(preset?.params);
      paramsByEffectRef.current = {
        ...paramsByEffectRef.current,
        [effect]: nextParams,
      };
      setParams(nextParams);
      if (typeof preset?.groupName === "string" && preset.groupName.trim()) {
        setExportFileName(stripKnownExportExtension(preset.groupName));
      }
      setPresetName(name);
      setPresetSelect(name);
      setStatus("preset-loaded");
    } catch (error) {
      applyUiError(error);
    }
  };

  const deletePresetByName = async (nameInput) => {
    const name = String(nameInput ?? "").trim();
    if (!name) {
      setLastResultText("Select a preset to delete.");
      return;
    }
    try {
      await illustratorClient.deletePreset(bridgeBaseUrl, effect, name);
      const listPayload = await illustratorClient.listPresets(bridgeBaseUrl, effect);
      const names = Array.isArray(listPayload.names) ? listPayload.names : [];
      setPresetNames(names);
      setPresetName(buildAutoPresetName(effect));
      setPresetSelect("");
      setStatus("preset-deleted");
    } catch (error) {
      applyUiError(error);
    }
  };
  const deletePreset = async () => deletePresetByName(presetSelect);

  const reorderPresets = async (nextNames) => {
    const requestSeq = ++presetReorderRequestSeqRef.current;
    const normalized = Array.isArray(nextNames)
      ? Array.from(
          new Set(
            nextNames
              .map((name) => String(name ?? "").trim())
              .filter((name) => name.length > 0)
          )
        )
      : [];
    setPresetNames(normalized);
    if (!normalized.includes(presetSelect)) {
      setPresetSelect("");
    }
    try {
      const payload = await illustratorClient.reorderPresets(bridgeBaseUrl, effect, normalized);
      if (requestSeq !== presetReorderRequestSeqRef.current) {
        return;
      }
      const persisted = Array.isArray(payload?.names) ? payload.names : normalized;
      setPresetNames(persisted);
      if (!persisted.includes(presetSelect)) {
        setPresetSelect("");
      }
      setStatus("preset-reordered");
    } catch (error) {
      if (requestSeq !== presetReorderRequestSeqRef.current) {
        return;
      }
      applyUiError(error);
      try {
        const listPayload = await illustratorClient.listPresets(bridgeBaseUrl, effect);
        const names = Array.isArray(listPayload.names) ? listPayload.names : [];
        setPresetNames(names);
      } catch {
        // Keep optimistic order on recovery failure.
      }
    }
  };

  const exportSelected = async () => {
    if (!latestGroupUuid) {
      applyUiError(
        "No groupUuid found. Run an effect first, then export.",
        "No groupUuid found. Run an effect first, then export.",
      );
      return;
    }
    const nextDirectoryPath = trimPath(exportPath);
    if (!nextDirectoryPath) {
      applyUiError("Export directory path is required.", "Export directory path is required.");
      return;
    }
    const nextFileName = stripKnownExportExtension(exportFileName) || buildAutoGroupName(effect);
    if (!nextFileName) {
      applyUiError("File name is required.", "File name is required.");
      return;
    }
    const outputPath = joinPath(nextDirectoryPath, `${nextFileName}.${exportFormat}`);
    setStatus("exporting");
    try {
      const payload = await illustratorClient.exportSelection(bridgeBaseUrl, {
        uuids: [latestGroupUuid],
        path: outputPath,
        format: exportFormat,
      });
      setStatus("exported");
      setLastResultText(JSON.stringify(payload, null, 2));
    } catch (error) {
      applyUiError(error);
    }
  };

  const pickExportDirectory = async () => {
    try {
      const payload = await illustratorClient.selectExportDirectory(bridgeBaseUrl);
      if (!payload?.selected || !payload?.path) {
        setStatus("ready");
        return;
      }
      setExportPath(payload.path);
      setStatus("export-dir-selected");
    } catch (error) {
      applyUiError(error);
    }
  };

  const buildSavePointSnapshot = () => ({
    imageToVector: {
      unit,
      autoSyncTarget,
      effect,
      params: sanitizePresetParams(params),
      paramsByEffect: {
        ...paramsByEffectRef.current,
        [effect]: sanitizePresetParams(params),
      },
      exportPath,
      exportFileName: stripKnownExportExtension(exportFileName),
      exportFormat,
      presetName,
      presetSelect,
      savePointName,
      settingsTab,
    },
    ui: {
      folders: {
        target: targetExpanded,
        preview: previewExpanded,
        preset: presetExpanded,
        parameters: parametersExpanded,
        history: historyExpanded,
        debug: false,
        export: exportExpanded,
      },
    },
  });

  const persistSavePoints = async (nextSavePoints, nextSelectedIndex) => {
    try {
      const persisted = await illustratorClient.patchUiState(bridgeBaseUrl, {
        ui: {
          savePoints: {
            imageToVector: nextSavePoints,
            imageToVectorSelectedIndex: nextSelectedIndex,
          },
        },
      });
      savedUiStateRef.current = persisted;
    } catch {
      // Save point persist is best-effort.
    }
  };

  const savePoint = async () => {
    const id = `sp_${Date.now()}`;
    const fileName =
      savePointName.trim() || stripKnownExportExtension(exportFileName) || buildAutoGroupName(effect);
    const label = `${toSavePointLabelTimestamp()} | ${fileName} | ${effect}`;
    const snapshot = buildSavePointSnapshot();
    const nextSavePoints = [{ id, label, snapshot }, ...savePoints].slice(0, MAX_SAVE_POINTS);
    const nextSelectedIndex = nextSavePoints.length > 0 ? 0 : -1;
    setSavePoints(nextSavePoints);
    setSelectedSavePointIndex(nextSelectedIndex);
    setStatus("save-point-saved");
    await persistSavePoints(nextSavePoints, nextSelectedIndex);
  };

  const loadSavePoint = () => {
    if (!Number.isInteger(selectedSavePointIndex) || selectedSavePointIndex < 0) {
      setHints(["Select a save point from History before loading."]);
      return;
    }
    const safeIndex =
      Number.isInteger(selectedSavePointIndex) && selectedSavePointIndex >= 0
        ? Math.min(selectedSavePointIndex, savePoints.length - 1)
        : 0;
    const selected = savePoints[safeIndex];
    if (!selected?.snapshot) {
      applyUiError("No save point found.", "No save point found.");
      return;
    }
    applyHydratedState(selected.snapshot);
    setSelectedSavePointIndex(safeIndex);
    setHints([]);
    setStatus("save-point-loaded");
  };

  const selectSavePointIndex = (index) => {
    if (!Number.isInteger(index)) return;
    if (savePoints.length === 0) {
      if (selectedSavePointIndex !== -1) {
        setSelectedSavePointIndex(-1);
        void persistSavePoints(savePoints, -1);
      }
      return;
    }
    const safeIndex = index < 0 ? -1 : Math.min(index, savePoints.length - 1);
    if (safeIndex === selectedSavePointIndex) {
      if (safeIndex >= 0) {
        setSelectedSavePointIndex(-1);
        void persistSavePoints(savePoints, -1);
      }
      return;
    }
    setSelectedSavePointIndex(safeIndex);
    void persistSavePoints(savePoints, safeIndex);
  };

  const removeSavePointAtIndex = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= savePoints.length) return;
    const nextSavePoints = savePoints.filter((_, i) => i !== index);
    const nextSelectedIndex = (() => {
      if (nextSavePoints.length === 0) return -1;
      if (!Number.isInteger(selectedSavePointIndex) || selectedSavePointIndex < 0) return -1;
      if (selectedSavePointIndex === index) {
        return Math.min(index, nextSavePoints.length - 1);
      }
      if (selectedSavePointIndex > index) {
        return selectedSavePointIndex - 1;
      }
      return Math.min(selectedSavePointIndex, nextSavePoints.length - 1);
    })();
    setSavePoints(nextSavePoints);
    setSelectedSavePointIndex(nextSelectedIndex);
    setStatus("save-point-removed");
    void persistSavePoints(nextSavePoints, nextSelectedIndex);
  };

  const resetAllState = () => {
    const confirmed =
      typeof window === "undefined" || typeof window.confirm !== "function"
        ? true
        : window.confirm("Reset all parameters and state to defaults?");
    if (!confirmed) {
      return;
    }
    const resetEffect = "dither";
    const resetGroupName = buildAutoGroupName(resetEffect);
    const resetParamsMap = createDefaultParamsByEffect();
    paramsByEffectRef.current = resetParamsMap;

    setStatus("idle");
    setTargetUuid("");
    setAutoSyncTarget(true);
    setEffect(resetEffect);
    setUnit("px");
    setParams({});
    setRisk("unknown");
    setEstimatedShapes("-");
    setHints([]);
    setLastResultText("No result yet.");
    setLastEstimate(null);
    setLatestGroupUuid(null);
    setPresetName(buildAutoPresetName(resetEffect));
    setPresetSelect("");
    setSavePointName("");
    setSettingsTab("parameters");
    setSelectedSavePointIndex(-1);
    void persistSavePoints(savePoints, -1);
    setTargetExpanded(true);
    setPreviewExpanded(true);
    setPresetExpanded(true);
    setParametersExpanded(true);
    setHistoryExpanded(true);
    setDebugExpanded(false);
    setExportExpanded(true);
    setExportPath(defaultExportPath);
    setExportFileName(resetGroupName);
    setExportFormat("svg");
    setCopyStatus("");
  };

  const copyLastResult = async () => {
    try {
      await navigator.clipboard.writeText(lastResultText);
      setCopyStatus("Copied");
      setTimeout(() => setCopyStatus(""), 1200);
    } catch (_) {
      setCopyStatus("Copy failed");
      setTimeout(() => setCopyStatus(""), 1500);
    }
  };

  panelActionsRef.current = {
    setTargetUuid,
    handleEffectChange,
    setUnit,
    setAutoSyncTarget,
    setTargetExpanded,
    useSelected,
    clearTargetUuid,
    runEstimate,
    setPreviewExpanded,
    runJob,
    setSettingsTab,
    handleParamChange,
    setParametersExpanded,
    setPresetName,
    setPresetSelect: (next) => {
      setPresetSelect(next);
      setPresetName(next);
    },
    setPresetExpanded,
    savePreset,
    loadPreset,
    deletePreset,
    deletePresetByName,
    reorderPresets,
    setExportPath,
    setExportFileName,
    setExportFormat,
    pickExportDirectory,
    setExportExpanded,
    exportSelected,
    savePoint,
    setSavePointName,
    loadSavePoint,
    selectSavePointIndex,
    removeSavePointAtIndex,
    copyLastResult,
    resetAllState,
    setDebugExpanded,
  };

  useEffect(() => {
    if (!uiStateHydrated || !panelHostRef.current) return undefined;

    panelHostRef.current.innerHTML = "";
    const pane = new Pane({ container: panelHostRef.current });
    registerCustomPlugins(pane, ["textinput", "row", "iconbutton", "toggle", "imagecontainer", "plain", "dynamiclist"]);

    const sections = {
      target: buildTargetSection(
        pane,
        {
          connected,
          targetUuid,
          autoSync: autoSyncTarget,
          expanded: targetExpanded,
          effect,
          unit,
        },
        {
          setTargetUuid: (next) => panelActionsRef.current?.setTargetUuid?.(next),
          changeEffect: (next) => panelActionsRef.current?.handleEffectChange?.(next),
          setUnit: (next) => panelActionsRef.current?.setUnit?.(next),
          setAutoSync: (next) => panelActionsRef.current?.setAutoSyncTarget?.(next),
          setExpanded: (next) => panelActionsRef.current?.setTargetExpanded?.(next),
          useSelected: () => panelActionsRef.current?.useSelected?.(),
          clearTargetUuid: () => panelActionsRef.current?.clearTargetUuid?.(),
        }
      ),
      preview: buildPreviewSection(
        pane,
        {
          connected,
          effect,
          params,
          risk,
          estimatedShapes,
          status,
          errorText: status === "error" ? previewErrorText || lastResultText : "",
          warningText,
          hints,
          expanded: previewExpanded,
        },
        {
          estimate: () => panelActionsRef.current?.runEstimate?.(),
          setExpanded: (next) => panelActionsRef.current?.setPreviewExpanded?.(next),
        }
      ),
      settings: buildSettingsConfigSection(
        pane,
        {
          tab: settingsTab,
          schema,
          params,
          unit,
          parametersExpanded,
          presetName,
          presetSelect,
          presetNames,
          presetExpanded,
          historyItems: savePoints.map((item) => item.label),
          historySelectedIndex: selectedSavePointIndex,
          historyCanLoad: savePoints.length > 0,
          historySaveName: savePointName,
          historyEmptyText: "No Save Points",
        },
        {
          setTab: (next) => panelActionsRef.current?.setSettingsTab?.(next),
          changeParam: (key, value) => panelActionsRef.current?.handleParamChange?.(key, value),
          setParametersExpanded: (next) => panelActionsRef.current?.setParametersExpanded?.(next),
          setPresetName: (next) => panelActionsRef.current?.setPresetName?.(next),
          setPresetSelect: (next) => panelActionsRef.current?.setPresetSelect?.(next),
          setPresetExpanded: (next) => panelActionsRef.current?.setPresetExpanded?.(next),
          savePreset: () => panelActionsRef.current?.savePreset?.(),
          loadPreset: () => panelActionsRef.current?.loadPreset?.(),
          deletePresetByName: (name) => panelActionsRef.current?.deletePresetByName?.(name),
          reorderPresets: (names) => panelActionsRef.current?.reorderPresets?.(names),
          savePoint: () => panelActionsRef.current?.savePoint?.(),
          setHistorySaveName: (next) => panelActionsRef.current?.setSavePointName?.(next),
          loadSavePoint: () => panelActionsRef.current?.loadSavePoint?.(),
          selectHistoryIndex: (index) => panelActionsRef.current?.selectSavePointIndex?.(index),
          removeHistoryIndex: (index) => panelActionsRef.current?.removeSavePointAtIndex?.(index),
        }
      ),
      runActions: buildRunActionsSection(
        pane,
        {
          connected,
        },
        {
          runFinal: () => panelActionsRef.current?.runJob?.(),
        }
      ),
      export: buildExportSection(
        pane,
        {
          connected,
          exportPath,
          exportFileName,
          exportFormat,
          expanded: exportExpanded,
        },
        {
          setExportPath: (next) => panelActionsRef.current?.setExportPath?.(next),
          setExportFileName: (next) => panelActionsRef.current?.setExportFileName?.(next),
          setExportFormat: (next) => panelActionsRef.current?.setExportFormat?.(next),
          pickExportDirectory: () => panelActionsRef.current?.pickExportDirectory?.(),
          setExpanded: (next) => panelActionsRef.current?.setExportExpanded?.(next),
          exportSelected: () => panelActionsRef.current?.exportSelected?.(),
        }
      ),
      debug: buildDebugSection(
        pane,
        {
          lastResultText,
          expanded: debugExpanded,
        },
        {
          copyLastResult: () => panelActionsRef.current?.copyLastResult?.(),
          resetAllState: () => panelActionsRef.current?.resetAllState?.(),
          setExpanded: (next) => panelActionsRef.current?.setDebugExpanded?.(next),
        }
      ),
    };
    panelSectionsRef.current = sections;

    return () => {
      Object.values(sections).forEach((section) => section?.dispose?.());
      panelSectionsRef.current = null;
      pane.dispose();
    };
  }, [uiStateHydrated]);

  useEffect(() => {
    const sections = panelSectionsRef.current;
    if (!sections) return;

    sections.target?.sync?.({
      connected,
      targetUuid,
      autoSync: autoSyncTarget,
      expanded: targetExpanded,
      effect,
      unit,
    });
    sections.preview?.sync?.({
      connected,
      effect,
      params,
      risk,
      estimatedShapes,
      status,
      errorText: status === "error" ? previewErrorText || lastResultText : "",
      warningText,
      hints,
      expanded: previewExpanded,
    });
    sections.settings?.sync?.({
      tab: settingsTab,
      schema,
      params,
      unit,
      parametersExpanded,
      presetName,
      presetSelect,
      presetNames,
      presetExpanded,
      historyItems: savePoints.map((item) => item.label),
      historySelectedIndex: selectedSavePointIndex,
      historyCanLoad: savePoints.length > 0,
      historySaveName: savePointName,
      historyEmptyText: "No Save Points",
    });
    sections.runActions?.sync?.({
      connected,
    });
    sections.export?.sync?.({
      connected,
      exportPath,
      exportFileName,
      exportFormat,
      expanded: exportExpanded,
    });
    sections.debug?.sync?.({
      lastResultText,
      expanded: debugExpanded,
    });
  }, [
    connected,
    targetUuid,
    autoSyncTarget,
    targetExpanded,
    effect,
    unit,
    params,
    risk,
    estimatedShapes,
    status,
    warningText,
    hints,
    previewExpanded,
    settingsTab,
    schema,
    parametersExpanded,
    presetName,
    presetSelect,
    presetNames,
    presetExpanded,
    exportPath,
    exportFileName,
    exportFormat,
    exportExpanded,
    savePoints,
    selectedSavePointIndex,
    previewErrorText,
    savePointName,
    lastResultText,
    debugExpanded,
  ]);

  if (!uiStateHydrated) {
    return null;
  }

  return <div ref={panelHostRef} />;
};
