export const effectSchemas = {
  dither: [
    {
      key: "pixelSize",
      label: "Pixel Size",
      type: "length",
      min: 0.2,
      max: 50,
      step: 0.1,
      placeholder: "2mm",
    },
    {
      key: "pattern",
      label: "Pattern",
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
    { key: "threshold", label: "Threshold", type: "number", min: 0, max: 1, step: 0.01, placeholder: "0.5" },
    { key: "invert", label: "Invert", type: "checkbox" },
    { key: "maxTiles", label: "Max Tiles", type: "number", min: 100, max: 100000, step: 1, placeholder: "40000" },
    { key: "colorMode", label: "Color Mode", type: "select", options: ["mono", "rgb"] },
  ],
  halftone: [
    {
      key: "dotSpacing",
      label: "Dot Spacing",
      type: "length",
      min: 0.2,
      max: 30,
      step: 0.1,
      placeholder: "2mm",
    },
    {
      key: "minDotSize",
      label: "Min Dot Size",
      type: "length",
      min: 0.1,
      max: 20,
      step: 0.1,
      placeholder: "0.2mm",
    },
    {
      key: "maxDotSize",
      label: "Max Dot Size",
      type: "length",
      min: 0.1,
      max: 30,
      step: 0.1,
      placeholder: "1.6mm",
    },
    { key: "angleDeg", label: "Angle (Deg)", type: "number", min: 0, max: 180, step: 1, placeholder: "45" },
    { key: "maxDots", label: "Max Dots", type: "number", min: 100, max: 100000, step: 1, placeholder: "2500" },
  ],
  mosaic: [
    {
      key: "tileSize",
      label: "Tile Size",
      type: "length",
      min: 0.2,
      max: 50,
      step: 0.1,
      placeholder: "3mm",
    },
    {
      key: "gap",
      label: "Gap",
      type: "length",
      min: 0,
      max: 10,
      step: 0.1,
      placeholder: "0mm",
    },
    {
      key: "cornerRadius",
      label: "Corner Radius",
      type: "length",
      min: 0,
      max: 10,
      step: 0.1,
      placeholder: "0mm",
    },
    { key: "maxTiles", label: "Max Tiles", type: "number", min: 100, max: 100000, step: 1, placeholder: "20000" },
    { key: "grayscale", label: "Grayscale", type: "checkbox" },
  ],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const stepPrecision = (step) => {
  if (!Number.isFinite(step)) return 6;
  const text = String(step);
  if (!text.includes(".")) return 0;
  return text.split(".")[1].length;
};
const snapToStep = (value, step, min) => {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(step) || step <= 0) return value;
  const base = Number.isFinite(min) ? min : 0;
  const snapped = Math.round((value - base) / step) * step + base;
  const precision = Math.max(0, stepPrecision(step));
  return Number(snapped.toFixed(precision));
};

export const parseInputValue = (field, rawValue, unit = "mm") => {
  if (field.type === "checkbox") {
    return Boolean(rawValue);
  }
  if (field.type === "number") {
    if (rawValue === "") {
      return undefined;
    }
    const num = Number(rawValue);
    return Number.isFinite(num) ? num : undefined;
  }
  if (field.type === "length") {
    if (rawValue === "") {
      return undefined;
    }
    const num = Number(rawValue);
    if (!Number.isFinite(num)) {
      return undefined;
    }
    let next = num;
    if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
      next = clamp(next, field.min, field.max);
    } else if (Number.isFinite(field.min)) {
      next = Math.max(next, field.min);
    } else if (Number.isFinite(field.max)) {
      next = Math.min(next, field.max);
    }
    next = snapToStep(next, field.step, field.min);
    return `${next}${unit}`;
  }
  if (typeof rawValue === "string" && rawValue.trim() === "") {
    return undefined;
  }
  return rawValue;
};
