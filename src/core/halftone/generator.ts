import { applyToneAdjustments } from "./tone";
import { clamp01 } from "./units";
import type { Bounds, Dot, HalftoneOptions } from "./types";

const hash32 = (value: number) => {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
};

export const generateHalftoneDots = (
  bounds: Bounds,
  options: HalftoneOptions,
  sampleLumaAlpha: (
    u: number,
    v: number,
    du: number,
    dv: number
  ) => { luma: number; alpha: number }
) => {
  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid target bounds for halftone.");
  }

  const angle = (options.angleDeg * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const absSin = Math.abs(sin);
  const absCos = Math.abs(cos);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const spacing = options.dotSpacingPt;
  const spacingX = spacing;
  const spacingY = spacing;
  // Expand the pre-rotation grid so the rotated pattern still covers the full target bounds.
  const gridWidth = width * absCos + height * absSin;
  const gridHeight = width * absSin + height * absCos;
  const overscanX = spacingX * 2;
  const overscanY = spacingY * 2;
  const expandedGridWidth = gridWidth + overscanX * 2;
  const expandedGridHeight = gridHeight + overscanY * 2;
  // Use a slightly oversized grid to avoid angle-dependent clipping near corners,
  // especially with dense spacing (e.g. px units).
  const xCount = Math.max(1, Math.ceil(expandedGridWidth / spacingX) + 1);
  const yCount = Math.max(1, Math.ceil(expandedGridHeight / spacingY) + 1);
  const coveredWidth = xCount * spacingX;
  const coveredHeight = yCount * spacingY;
  const gridStartX = centerX - coveredWidth / 2 + spacingX / 2;
  const gridStartY = centerY + coveredHeight / 2 - spacingY / 2;
  const maxRadiusPt = Math.min(options.maxRadiusPt, spacing * 0.45);
  const minRadiusPt = Math.min(options.minRadiusPt, maxRadiusPt);

  const dots: Dot[] = [];
  for (let gy = 0; gy < yCount; gy += 1) {
    for (let gx = 0; gx < xCount; gx += 1) {
      const baseX = gridStartX + gx * spacingX;
      const baseY = gridStartY - gy * spacingY;

      const dx = baseX - centerX;
      const dy = baseY - centerY;
      const x = centerX + cos * dx - sin * dy;
      const y = centerY + sin * dx + cos * dy;
      if (x < bounds.left || x > bounds.right || y < bounds.bottom || y > bounds.top) {
        continue;
      }

      const u = clamp01((x - bounds.left) / width);
      const v = clamp01((bounds.top - y) / height);
      const du = clamp01(spacingX / width);
      const dv = clamp01(spacingY / height);
      const { luma, alpha } = sampleLumaAlpha(u, v, du, dv);
      const toneDarkness = applyToneAdjustments(luma, options);
      const darkness = clamp01(toneDarkness * clamp01(alpha));
      if (darkness <= options.backgroundThreshold) {
        continue;
      }

      const r = Math.max(minRadiusPt, darkness * maxRadiusPt);
      if (r <= 0.05) {
        continue;
      }

      dots.push({ x, y, r });
    }
  }

  if (dots.length <= options.maxDots) {
    return dots;
  }

  // Downsample deterministically using coordinate-based hashing to reduce stripe artifacts.
  const ranked = dots
    .map((dot, i) => {
      const key = hash32(
        Math.round(dot.x * 10) * 73856093 ^
          Math.round(dot.y * 10) * 19349663 ^
          i
      );
      return { key, dot };
    })
    .sort((a, b) => a.key - b.key)
    .slice(0, options.maxDots)
    .map((entry) => entry.dot);

  return ranked;
};
