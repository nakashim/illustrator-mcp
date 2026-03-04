import { clamp01 } from "../halftone";
import type { Bounds } from "../halftone";

export type MosaicTile = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fillCmyk: [number, number, number, number];
};

export type MosaicOptions = {
  tileSizePt: number;
  gapPt: number;
  cornerRadiusPt: number;
  maxTiles: number;
  backgroundThreshold: number;
  grayscale: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const hash32 = (value: number) => {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
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

export const generateMosaicTiles = (
  bounds: Bounds,
  options: MosaicOptions,
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
    throw new Error("Invalid target bounds for mosaic.");
  }

  const tileSize = Math.max(0.2, options.tileSizePt);
  const gap = Math.max(0, options.gapPt);
  const pitch = tileSize + gap;
  const xCount = Math.max(1, Math.floor((width + gap) / pitch));
  const yCount = Math.max(1, Math.floor((height + gap) / pitch));

  const tiles: MosaicTile[] = [];
  for (let gy = 0; gy < yCount; gy += 1) {
    for (let gx = 0; gx < xCount; gx += 1) {
      const x = bounds.left + gx * pitch;
      const yTop = bounds.top - gy * pitch;
      const tileWidth = tileSize;
      const tileHeight = tileSize;

      if (x + tileWidth > bounds.right || yTop - tileHeight < bounds.bottom) {
        continue;
      }

      const radius = Math.max(
        0,
        Math.min(options.cornerRadiusPt, Math.min(tileWidth, tileHeight) * 0.49)
      );

      const u = clamp01(((x + tileWidth * 0.5) - bounds.left) / width);
      const v = clamp01((bounds.top - (yTop - tileHeight * 0.5)) / height);
      const du = clamp01(tileWidth / width);
      const dv = clamp01(tileHeight / height);

      const { r, g, b, alpha } = sampleRgbaAlpha(u, v, du, dv);
      if (alpha <= options.backgroundThreshold) {
        continue;
      }

      const fillCmyk = options.grayscale
        ? [0, 0, 0, (1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100]
        : rgbToCmyk(r, g, b);

      tiles.push({
        x,
        y: yTop,
        width: tileWidth,
        height: tileHeight,
        radius,
        fillCmyk: [
          clamp(fillCmyk[0], 0, 100),
          clamp(fillCmyk[1], 0, 100),
          clamp(fillCmyk[2], 0, 100),
          clamp(fillCmyk[3], 0, 100),
        ],
      });
    }
  }

  if (tiles.length <= options.maxTiles) {
    return tiles;
  }

  // Downsample spatially across the whole artwork (not top-to-bottom truncation).
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
