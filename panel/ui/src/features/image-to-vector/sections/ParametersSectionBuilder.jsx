import { parseLengthToPt } from "../../../../../../src/core/halftone";

const SPECIAL_OPTION_LABELS = {
  rgb: "RGB",
};
const UNIT_ORDER = ["px", "mm", "Q", "pt"];
const SUPERSCRIPT_DIGITS = {
  0: "⁰",
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
};

const toDisplayLabel = (value) => {
  const raw = String(value ?? "");
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (SPECIAL_OPTION_LABELS[lower]) {
    return SPECIAL_OPTION_LABELS[lower];
  }
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([a-zA-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const toSelectOptions = (options) =>
  Object.fromEntries((options ?? []).map((opt) => [toDisplayLabel(opt), opt]));

const toSuperscript = (value) =>
  String(value)
    .split("")
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? "")
    .join("");
const toUnitMarker = (unit) => {
  const index = UNIT_ORDER.indexOf(String(unit ?? ""));
  return index >= 0 ? toSuperscript(index + 1) : "";
};
const toFieldLabel = (field, unit) => {
  const base = String(field?.label ?? field?.key ?? "").trim();
  if (field?.type !== "length") return base;
  return `${base}${toUnitMarker(unit)}`;
};
const hasFinite = (v) => typeof v === "number" && Number.isFinite(v);
const stepPrecision = (step) => {
  if (!hasFinite(step)) return 6;
  const text = String(step);
  if (!text.includes(".")) return 0;
  return text.split(".")[1].length;
};
const snapToStep = (value, step, min) => {
  if (!hasFinite(value)) return value;
  if (!hasFinite(step) || step <= 0) return value;
  const base = hasFinite(min) ? min : 0;
  const snapped = Math.round((value - base) / step) * step + base;
  return Number(snapped.toFixed(Math.max(0, stepPrecision(step))));
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ptToUnitValue = (pt, unit) => {
  if (unit === "pt" || unit === "px") return pt;
  if (unit === "pc") return pt / 12;
  if (unit === "in") return pt / 72;
  if (unit === "ft") return pt / (72 * 12);
  if (unit === "yd") return pt / (72 * 36);
  if (unit === "Q") return (pt * 25.4 * 4) / 72;
  if (unit === "cm") return (pt * 2.54) / 72;
  if (unit === "m") return (pt * 25.4) / (72 * 1000);
  return (pt * 25.4) / 72;
};
const parseLengthByUnit = (raw, unit) => {
  if (hasFinite(raw)) return raw;
  if (typeof raw !== "string") return undefined;
  const input = raw.trim();
  if (!input) return undefined;
  const pt = parseLengthToPt(input);
  if (!Number.isFinite(pt)) return undefined;
  return ptToUnitValue(pt, unit);
};
const toInitialValue = (field, raw, unit) => {
  if (field.type === "checkbox") {
    return Boolean(raw);
  }
  if (field.type === "number") {
    if (hasFinite(raw)) return raw;
    if (hasFinite(field.min)) return field.min;
    return 0;
  }
  if (field.type === "length") {
    const parsed = parseLengthByUnit(raw, unit);
    if (hasFinite(parsed)) {
      let next = parsed;
      if (hasFinite(field.min) && hasFinite(field.max)) {
        next = clamp(next, field.min, field.max);
      } else if (hasFinite(field.min)) {
        next = Math.max(next, field.min);
      } else if (hasFinite(field.max)) {
        next = Math.min(next, field.max);
      }
      return snapToStep(next, field.step, field.min);
    }
    const placeholderParsed = parseLengthByUnit(field.placeholder, unit);
    if (hasFinite(placeholderParsed)) return placeholderParsed;
    if (hasFinite(field.min)) return field.min;
    return 0;
  }
  if (field.type === "select") {
    if (typeof raw === "string" && raw.length > 0) return raw;
    return field.options?.[0] ?? "";
  }
  if (typeof raw === "string") return raw;
  return "";
};

export const buildParametersSection = (containerApi, state, actions) => {
  const sectionState = {};
  const apiMap = new Map();
  let fieldApis = [];
  let syncing = false;
  let schemaSignature = "";

  const toSchemaSignature = (schema) =>
    JSON.stringify(
      (schema ?? []).map((field) => ({
        key: field?.key ?? "",
        type: field?.type ?? "",
        label: field?.label ?? "",
        min: field?.min ?? null,
        max: field?.max ?? null,
        step: field?.step ?? null,
        options: Array.isArray(field?.options) ? field.options : [],
        placeholder: field?.placeholder ?? "",
      }))
    );

  const clearBindings = () => {
    fieldApis.forEach((api) => {
      containerApi.remove?.(api);
    });
    fieldApis = [];
    apiMap.clear();
    Object.keys(sectionState).forEach((key) => {
      delete sectionState[key];
    });
  };

  const buildBindings = (schema, params, unit) => {
    (schema ?? []).forEach((field) => {
      sectionState[field.key] = toInitialValue(field, params?.[field.key], unit);
      const common = { label: toFieldLabel(field, unit) };
      let bindingApi;
      if (field.type === "text") {
        bindingApi = containerApi.addBinding(sectionState, field.key, {
          ...common,
          view: "textinputblade",
          placeholder: field.placeholder ?? "",
        });
      } else if (field.type === "checkbox") {
        bindingApi = containerApi.addBinding(sectionState, field.key, {
          ...common,
          view: "toggleblade",
        });
      } else if (field.type === "select") {
        bindingApi = containerApi.addBinding(sectionState, field.key, {
          ...common,
          options: toSelectOptions(field.options),
        });
      } else if (field.type === "number" || field.type === "length") {
        bindingApi = containerApi.addBinding(sectionState, field.key, {
          ...common,
          min: field.min,
          max: field.max,
          step: field.step,
        });
      } else {
        bindingApi = containerApi.addBinding(sectionState, field.key, common);
      }
      bindingApi.on("change", (ev) => {
        if (syncing) return;
        if ((field.type === "number" || field.type === "length") && "last" in ev && ev.last === false) return;
        actions.changeParam?.(field.key, ev.value);
      });
      apiMap.set(field.key, bindingApi);
      fieldApis.push(bindingApi);
    });
  };

  schemaSignature = toSchemaSignature(state.schema);
  buildBindings(state.schema, state.params, state.unit);

  return {
    sync(next) {
      const nextSchemaSignature = toSchemaSignature(next.schema);
      if (schemaSignature !== nextSchemaSignature) {
        schemaSignature = nextSchemaSignature;
        clearBindings();
        buildBindings(next.schema, next.params, next.unit);
        return;
      }
      syncing = true;
      try {
        (next.schema ?? []).forEach((field) => {
          if (!(field.key in sectionState)) return;
          const api = apiMap.get(field.key);
          const nextLabel = toFieldLabel(field, next.unit);
          if (api?.label !== nextLabel) {
            api.label = nextLabel;
          }
          const nextValue = toInitialValue(field, next.params?.[field.key], next.unit);
          if (sectionState[field.key] === nextValue) return;
          sectionState[field.key] = nextValue;
          api?.refresh?.();
        });
      } finally {
        syncing = false;
      }
    },
  };
};
