import { generateDitherTiles } from "../../../../../../src/core/dither/index";
import { generateHalftoneDots, clamp01 } from "../../../../../../src/core/halftone";
import { parseLengthToPt } from "../../../../../../src/core/halftone";
import { generateMosaicTiles } from "../../../../../../src/core/mosaic";

const ALLOWED_PATTERNS = new Set([
  "bayer2",
  "bayer4",
  "bayer8",
  "blue-noise",
  "clustered_4x4",
  "floyd-steinberg",
  "atkinson",
  "riemersma",
  "random",
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseNumber = (value, fallback) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const parsePixelSizePt = (value, fallback = "2mm") => {
  if (typeof value === "string" && value.trim()) return parseLengthToPt(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return parseLengthToPt(fallback);
};

const normalizePattern = (value) => (typeof value === "string" && ALLOWED_PATTERNS.has(value) ? value : "bayer4");

const normalizeColorMode = (value) => (value === "rgb" ? "rgb" : "mono");

const toBoolean = (value, fallback = false) => (typeof value === "boolean" ? value : fallback);

const cmykToRgbCss = (cmyk) => {
  if (!Array.isArray(cmyk) || cmyk.length !== 4) return "rgb(255, 255, 255)";
  const [c, m, y, k] = cmyk.map((v) => clamp(Number(v) / 100, 0, 1));
  const r = Math.round(255 * (1 - c) * (1 - k));
  const g = Math.round(255 * (1 - m) * (1 - k));
  const b = Math.round(255 * (1 - y) * (1 - k));
  return `rgb(${r}, ${g}, ${b})`;
};

const createRegionSampler = (imageData, width, height) => {
  const { data } = imageData;
  return (u, v, du, dv) => {
    const cx = clamp(u, 0, 1) * width;
    const cy = clamp(v, 0, 1) * height;
    const halfW = (clamp(du, 0, 1) * width) / 2;
    const halfH = (clamp(dv, 0, 1) * height) / 2;
    const x0 = clamp(Math.floor(cx - halfW), 0, Math.max(0, width - 1));
    const y0 = clamp(Math.floor(cy - halfH), 0, Math.max(0, height - 1));
    const x1 = clamp(Math.ceil(cx + halfW), 0, width);
    const y1 = clamp(Math.ceil(cy + halfH), 0, height);

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let count = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * width + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        a += data[i + 3];
        count += 1;
      }
    }
    if (count <= 0) {
      return { r: 0, g: 0, b: 0, alpha: 0 };
    }
    return {
      r: r / count,
      g: g / count,
      b: b / count,
      alpha: (a / count) / 255,
    };
  };
};

const createLumaSampler = (imageData, width, height) => {
  const rgbaSampler = createRegionSampler(imageData, width, height);
  return (u, v, du, dv) => {
    const { r, g, b, alpha } = rgbaSampler(u, v, du, dv);
    const luma = clamp01((0.299 * r + 0.587 * g + 0.114 * b) / 255);
    return { luma, alpha };
  };
};

const normalizeMaxCount = (value, fallback) =>
  Math.floor(clamp(parseNumber(value, fallback), 100, 100000));

const toRgbFillStyle = (fillCmyk) => cmykToRgbCss(fillCmyk);

const fillRoundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) * 0.5));
  if (r <= 0.01) {
    ctx.fillRect(x, y, width, height);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
};

export const renderDitherPreviewWithCore = (ctx, region, params, effectScale = 1) => {
  const sourceImageData = ctx.getImageData(region.x, region.y, region.width, region.height);
  const sampler = createRegionSampler(sourceImageData, region.width, region.height);
  const scaledPixelSizePt = parsePixelSizePt(params?.pixelSize, "2mm") * Math.max(0.05, effectScale);

  const bounds = {
    left: 0,
    right: region.width,
    top: region.height,
    bottom: 0,
  };
  const colorMode = normalizeColorMode(params?.colorMode);
  const tiles = generateDitherTiles(
    bounds,
    {
      pixelSizePt: scaledPixelSizePt,
      maxTiles: Math.floor(clamp(parseNumber(params?.maxTiles, 40000), 100, 100000)),
      threshold: clamp(parseNumber(params?.threshold, 0.5), 0, 1),
      invert: toBoolean(params?.invert, false),
      pattern: normalizePattern(params?.pattern),
      backgroundThreshold: clamp(parseNumber(params?.backgroundThreshold, 0.02), 0, 1),
      colorMode,
      gamma: clamp(parseNumber(params?.gamma, 1), 0.1, 5),
      blackPoint: clamp(parseNumber(params?.blackPoint, 0), 0, 1),
      whitePoint: clamp(parseNumber(params?.whitePoint, 1), 0, 1),
    },
    sampler,
  );

  // Keep source image as background and draw dither tiles on top.

  for (const tile of tiles) {
    const x = region.x + (tile.x - bounds.left);
    const y = region.y + (bounds.top - tile.y);
    const w = Math.max(1, tile.width);
    const h = Math.max(1, tile.height);
    if (colorMode === "rgb") {
      ctx.fillStyle = cmykToRgbCss(tile.fillCmyk);
    } else {
      ctx.fillStyle = "#000";
    }
    ctx.fillRect(x, y, w, h);
  }
};

export const renderMosaicPreviewWithCore = (ctx, region, params, effectScale = 1) => {
  const sourceImageData = ctx.getImageData(region.x, region.y, region.width, region.height);
  const sampler = createRegionSampler(sourceImageData, region.width, region.height);
  const bounds = {
    left: 0,
    right: region.width,
    top: region.height,
    bottom: 0,
  };

  const tiles = generateMosaicTiles(
    bounds,
    {
      tileSizePt: parsePixelSizePt(params?.tileSize, "3mm") * Math.max(0.05, effectScale),
      gapPt: parsePixelSizePt(params?.gap, "0mm") * Math.max(0, effectScale),
      cornerRadiusPt: parsePixelSizePt(params?.cornerRadius, "0mm") * Math.max(0, effectScale),
      maxTiles: normalizeMaxCount(params?.maxTiles, 20000),
      backgroundThreshold: clamp(parseNumber(params?.backgroundThreshold, 0.02), 0, 1),
      grayscale: toBoolean(params?.grayscale, false),
    },
    sampler,
  );

  for (const tile of tiles) {
    const x = region.x + (tile.x - bounds.left);
    const y = region.y + (bounds.top - tile.y);
    const w = Math.max(1, tile.width);
    const h = Math.max(1, tile.height);
    ctx.fillStyle = toRgbFillStyle(tile.fillCmyk);
    fillRoundedRect(ctx, x, y, w, h, tile.radius);
  }
};

export const renderHalftonePreviewWithCore = (ctx, region, params, effectScale = 1) => {
  const sourceImageData = ctx.getImageData(region.x, region.y, region.width, region.height);
  const lumaSampler = createLumaSampler(sourceImageData, region.width, region.height);
  const bounds = {
    left: 0,
    right: region.width,
    top: region.height,
    bottom: 0,
  };

  const dots = generateHalftoneDots(
    bounds,
    {
      dotSpacingPt: parsePixelSizePt(params?.dotSpacing, "2mm") * Math.max(0.05, effectScale),
      minRadiusPt: (parsePixelSizePt(params?.minDotSize, "0.2mm") / 2) * Math.max(0.05, effectScale),
      maxRadiusPt: (parsePixelSizePt(params?.maxDotSize, "1.6mm") / 2) * Math.max(0.05, effectScale),
      angleDeg: parseNumber(params?.angleDeg, 45),
      maxDots: normalizeMaxCount(params?.maxDots, 2500),
      invert: toBoolean(params?.invert, false),
      contrast: clamp(parseNumber(params?.contrast, 0), -100, 100),
      gamma: clamp(parseNumber(params?.gamma, 1), 0.1, 5),
      dotScale: clamp(parseNumber(params?.dotScale, 1), 0, 3),
      backgroundThreshold: clamp(parseNumber(params?.backgroundThreshold, 0.06), 0, 1),
    },
    lumaSampler,
  );

  ctx.fillStyle = "#000";
  for (const dot of dots) {
    const x = region.x + (dot.x - bounds.left);
    const y = region.y + (bounds.top - dot.y);
    const r = Math.max(0.5, dot.r);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
};
