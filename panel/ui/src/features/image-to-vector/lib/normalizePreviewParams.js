const LENGTH_KEYS_BY_EFFECT = {
  dither: ["pixelSize"],
  mosaic: ["tileSize", "gap", "cornerRadius", "strokeWidth"],
  halftone: ["dotSpacing", "minDotSize", "maxDotSize"],
};

const AREA_KEYS_BY_EFFECT = {
  dither: ["maxTiles"],
  mosaic: ["maxTiles"],
  halftone: ["maxDots"],
};

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const parseNumberLike = (value) => {
  if (isFiniteNumber(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const scaleLengthValue = (value, scale) => {
  if (typeof value === "string") {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]*)$/);
    if (!match) return value;
    const numeric = Number.parseFloat(match[1]);
    if (!Number.isFinite(numeric)) return value;
    const unit = match[2] ?? "";
    return `${numeric * scale}${unit}`;
  }
  if (isFiniteNumber(value)) {
    return value * scale;
  }
  return value;
};

const scaleAreaCount = (value, areaScale) => {
  const numeric = parseNumberLike(value);
  if (!Number.isFinite(numeric)) return value;
  return Math.max(1, Math.round(numeric * areaScale));
};

export const normalizePreviewParams = (effect, params, mode, ctx) => {
  const base = params && typeof params === "object" ? params : {};
  const next = { ...base };

  const safeScale = isFiniteNumber(ctx?.scale) ? ctx.scale : 1;
  const safeAreaScale = isFiniteNumber(ctx?.areaScale) ? ctx.areaScale : safeScale * safeScale;
  const lengthScale = mode === "scaled-full" ? safeScale : 1;
  const areaScale = mode === "scaled-full" ? safeAreaScale : 1;

  const lengthKeys = LENGTH_KEYS_BY_EFFECT[effect] ?? [];
  const areaKeys = AREA_KEYS_BY_EFFECT[effect] ?? [];

  lengthKeys.forEach((key) => {
    if (!(key in next)) return;
    next[key] = scaleLengthValue(next[key], lengthScale);
  });

  areaKeys.forEach((key) => {
    if (!(key in next)) return;
    next[key] = scaleAreaCount(next[key], areaScale);
  });

  return next;
};
