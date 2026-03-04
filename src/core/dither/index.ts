import { clamp01 } from "../halftone";
import type { Bounds } from "../halftone";
import type { MosaicTile } from "../mosaic";

export type DitherPattern = "bayer4" | "bayer8" | "random";
export type DitherColorMode = "mono" | "rgb";

export type DitherOptions = {
  pixelSizePt: number;
  maxTiles: number;
  threshold: number;
  invert: boolean;
  pattern: DitherPattern;
  backgroundThreshold: number;
  colorMode: DitherColorMode;
  gamma: number;
  blackPoint: number;
  whitePoint: number;
};

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];

const hash32 = (value: number) => {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
};

const patternValue = (pattern: DitherPattern, gx: number, gy: number) => {
  if (pattern === "bayer4") {
    return (BAYER4[gy % 4][gx % 4] + 0.5) / 16;
  }
  if (pattern === "bayer8") {
    return (BAYER8[gy % 8][gx % 8] + 0.5) / 64;
  }
  return (hash32(gx * 73856093 ^ gy * 19349663) % 1024) / 1024;
};

const rgbToCmyk = (r: number, g: number, b: number): [number, number, number, number] => {
  const rn = clamp01(r / 255);
  const gn = clamp01(g / 255);
  const bn = clamp01(b / 255);
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 1) {
    return [0, 0, 0, 100];
  }
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return [c * 100, m * 100, y * 100, k * 100];
};

const normalizeWithTone = (
  value: number,
  gamma: number,
  blackPoint: number,
  whitePoint: number
) => {
  const v = clamp01(value);
  const bp = clamp01(blackPoint);
  const wp = clamp01(Math.max(whitePoint, bp + 0.001));
  const remapped = clamp01((v - bp) / (wp - bp));
  const g = Math.max(0.1, gamma);
  return clamp01(Math.pow(remapped, 1 / g));
};

export const generateDitherTiles = (
  bounds: Bounds,
  options: DitherOptions,
  sampleRgbaAlpha: (u: number, v: number, du: number, dv: number) => {
    r: number;
    g: number;
    b: number;
    alpha: number;
  }
) => {
  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid target bounds for dither.");
  }

  const pixelSize = Math.max(0.2, options.pixelSizePt);
  const xCount = Math.max(1, Math.floor(width / pixelSize));
  const yCount = Math.max(1, Math.floor(height / pixelSize));
  const xRemainder = width - xCount * pixelSize;
  const yRemainder = height - yCount * pixelSize;

  const tiles: MosaicTile[] = [];
  for (let gy = 0; gy < yCount; gy += 1) {
    for (let gx = 0; gx < xCount; gx += 1) {
      const x = bounds.left + xRemainder / 2 + gx * pixelSize;
      const yTop = bounds.top - yRemainder / 2 - gy * pixelSize;
      const u = clamp01((x + pixelSize * 0.5 - bounds.left) / width);
      const v = clamp01((bounds.top - (yTop - pixelSize * 0.5)) / height);
      const du = clamp01(pixelSize / width);
      const dv = clamp01(pixelSize / height);

      const { r, g, b, alpha } = sampleRgbaAlpha(u, v, du, dv);
      if (alpha <= options.backgroundThreshold) {
        continue;
      }

      const rn = normalizeWithTone(r / 255, options.gamma, options.blackPoint, options.whitePoint);
      const gn = normalizeWithTone(g / 255, options.gamma, options.blackPoint, options.whitePoint);
      const bn = normalizeWithTone(b / 255, options.gamma, options.blackPoint, options.whitePoint);
      const luma = clamp01(0.299 * rn + 0.587 * gn + 0.114 * bn);
      const effectiveLuma = clamp01(luma * alpha + (1 - alpha));
      const p = patternValue(options.pattern, gx, gy);
      const cutoff = clamp01(options.threshold + (p - 0.5) * 0.25);

      if (options.colorMode === "mono") {
        const on = options.invert ? effectiveLuma >= cutoff : effectiveLuma <= cutoff;
        if (!on) {
          continue;
        }
        tiles.push({
          x,
          y: yTop,
          width: pixelSize,
          height: pixelSize,
          radius: 0,
          fillCmyk: [0, 0, 0, 100],
        });
      } else {
        const rBit = options.invert ? rn < cutoff : rn > cutoff;
        const gBit = options.invert ? gn < cutoff : gn > cutoff;
        const bBit = options.invert ? bn < cutoff : bn > cutoff;
        const fillCmyk = rgbToCmyk(rBit ? 255 : 0, gBit ? 255 : 0, bBit ? 255 : 0);
        if (fillCmyk[0] + fillCmyk[1] + fillCmyk[2] + fillCmyk[3] <= 0.001) {
          continue;
        }
        tiles.push({
          x,
          y: yTop,
          width: pixelSize,
          height: pixelSize,
          radius: 0,
          fillCmyk,
        });
      }
    }
  }

  if (tiles.length <= options.maxTiles) {
    return tiles;
  }

  return tiles
    .map((tile, i) => {
      const key = hash32(
        Math.round(tile.x * 10) * 73856093 ^
          Math.round(tile.y * 10) * 19349663 ^
          i
      );
      return { key, tile };
    })
    .sort((a, b) => a.key - b.key)
    .slice(0, options.maxTiles)
    .map((entry) => entry.tile);
};
