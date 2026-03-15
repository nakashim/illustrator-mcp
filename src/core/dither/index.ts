import { clamp01 } from "../halftone";
import type { Bounds } from "../halftone";
import type { MosaicTile } from "../mosaic";

export type DitherPattern =
  | "bayer2"
  | "bayer4"
  | "bayer8"
  | "blue-noise"
  | "clustered_4x4"
  | "floyd-steinberg"
  | "riemersma"
  | "atkinson"
  | "random";
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

// Matches ImageJ Bayer_2x2 order (row-major): [2,3;4,1].
// Normalized to 0..1 by dividing threshold(0..255) by 255:
// [127, 191; 255, 63] / 255
const BAYER2_IMAGEJ = [
  [127 / 255, 191 / 255],
  [1, 63 / 255],
];

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

const CLUSTERED4 = [
  [0.75, 0.375, 0.625, 0.25],
  [0.0625, 1.0, 0.875, 0.4375],
  [0.5, 0.8125, 0.9375, 0.125],
  [0.1875, 0.5625, 0.3125, 0.6875],
];

const BLUE_NOISE_TILE_SIZE = 32;

const hash32 = (value: number) => {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
};

const buildBlueNoiseTile = (size: number) => {
  const total = size * size;
  let values = Array.from({ length: total }, (_, i) => hash32(i * 2654435761) / 0xffffffff);

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const blurred = new Array<number>(total).fill(0);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const sx = (x + ox + size) % size;
            const sy = (y + oy + size) % size;
            sum += values[sy * size + sx];
          }
        }
        blurred[y * size + x] = sum / 9;
      }
    }

    const highPassed = values.map((v, i) => v - blurred[i]);
    const ranked = highPassed
      .map((v, i) => ({ v, i }))
      .sort((a, b) => a.v - b.v);

    const nextValues = new Array<number>(total).fill(0);
    for (let rank = 0; rank < ranked.length; rank += 1) {
      const idx = ranked[rank].i;
      nextValues[idx] = rank / Math.max(1, total - 1);
    }
    values = nextValues;
  }

  const tile: number[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      tile[y][x] = values[y * size + x];
    }
  }
  return tile;
};

const BLUE_NOISE_TILE = buildBlueNoiseTile(BLUE_NOISE_TILE_SIZE);

const isErrorDiffusionPattern = (pattern: DitherPattern) =>
  pattern === "floyd-steinberg" || pattern === "atkinson";

const isPathDiffusionPattern = (pattern: DitherPattern) => pattern === "riemersma";

const patternValue = (pattern: DitherPattern, gx: number, gy: number) => {
  if (pattern === "bayer2") {
    return BAYER2_IMAGEJ[gy % 2][gx % 2];
  }
  if (pattern === "bayer4") {
    return (BAYER4[gy % 4][gx % 4] + 0.5) / 16;
  }
  if (pattern === "bayer8") {
    return (BAYER8[gy % 8][gx % 8] + 0.5) / 64;
  }
  if (pattern === "blue-noise") {
    return BLUE_NOISE_TILE[gy % BLUE_NOISE_TILE_SIZE][gx % BLUE_NOISE_TILE_SIZE];
  }
  if (pattern === "clustered_4x4") {
    return CLUSTERED4[gy % 4][gx % 4];
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

type DiffusionKernel = Array<{ dx: number; dy: number; w: number }>;

const FLOYD_STEINBERG_KERNEL: DiffusionKernel = [
  { dx: 1, dy: 0, w: 7 / 16 },
  { dx: -1, dy: 1, w: 3 / 16 },
  { dx: 0, dy: 1, w: 5 / 16 },
  { dx: 1, dy: 1, w: 1 / 16 },
];

const ATKINSON_KERNEL: DiffusionKernel = [
  { dx: 1, dy: 0, w: 1 / 8 },
  { dx: 2, dy: 0, w: 1 / 8 },
  { dx: -1, dy: 1, w: 1 / 8 },
  { dx: 0, dy: 1, w: 1 / 8 },
  { dx: 1, dy: 1, w: 1 / 8 },
  { dx: 0, dy: 2, w: 1 / 8 },
];

const getDiffusionKernel = (pattern: DitherPattern): DiffusionKernel =>
  pattern === "atkinson" ? ATKINSON_KERNEL : FLOYD_STEINBERG_KERNEL;

const diffuseBinary = (
  values: number[][],
  threshold: number,
  invert: boolean,
  mode: "dark" | "light",
  kernel: DiffusionKernel
) => {
  const rows = values.length;
  const cols = rows > 0 ? values[0].length : 0;
  const buffer = values.map((row) => row.slice());
  const bits: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const oldPixel = clamp01(buffer[y][x]);
      let bit = false;
      let newPixel = 0;

      if (mode === "dark") {
        const isDark = invert ? oldPixel >= threshold : oldPixel <= threshold;
        bit = isDark;
        newPixel = isDark ? 0 : 1;
      } else {
        const isLight = invert ? oldPixel < threshold : oldPixel >= threshold;
        bit = isLight;
        newPixel = isLight ? 1 : 0;
      }

      bits[y][x] = bit;
      const quantError = oldPixel - newPixel;
      if (Math.abs(quantError) < 1e-12) {
        continue;
      }

      for (const step of kernel) {
        const nx = x + step.dx;
        const ny = y + step.dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
          continue;
        }
        buffer[ny][nx] += quantError * step.w;
      }
    }
  }

  return bits;
};

const d2xy = (n: number, d: number): [number, number] => {
  let x = 0;
  let y = 0;
  let t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t >> 1);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const temp = x;
      x = y;
      y = temp;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
};

const nextPowerOfTwo = (value: number) => {
  let n = 1;
  while (n < value) {
    n *= 2;
  }
  return n;
};

const buildHilbertPath = (width: number, height: number): Array<[number, number]> => {
  const size = nextPowerOfTwo(Math.max(width, height));
  const path: Array<[number, number]> = [];
  const total = size * size;
  for (let d = 0; d < total; d += 1) {
    const [x, y] = d2xy(size, d);
    if (x < width && y < height) {
      path.push([x, y]);
    }
  }
  return path;
};

const riemersmaDiffuse = (
  values: number[][],
  threshold: number,
  invert: boolean,
  mode: "dark" | "light",
  width: number,
  height: number
) => {
  const path = buildHilbertPath(width, height);
  const bits: boolean[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false)
  );
  const historyLength = 24;
  const r = 1 / 16;
  const feedbackGain = 0.35;
  const weights = Array.from({ length: historyLength }, (_, i) =>
    Math.pow(r, i / Math.max(1, historyLength - 1))
  );
  const weightSum = weights.reduce((sum, w) => sum + w, 0) || 1;
  const errorHistory: number[] = [];

  for (const [x, y] of path) {
    const base = clamp01(values[y][x]);
    let weightedError = 0;
    for (let i = 0; i < errorHistory.length; i += 1) {
      weightedError += errorHistory[i] * weights[i];
    }
    const normalizedError = (weightedError / weightSum) * feedbackGain;
    const oldPixel = clamp01(base + normalizedError);

    let bit = false;
    let newPixel = 0;
    if (mode === "dark") {
      const isDark = invert ? oldPixel >= threshold : oldPixel <= threshold;
      bit = isDark;
      newPixel = isDark ? 0 : 1;
    } else {
      const isLight = invert ? oldPixel < threshold : oldPixel >= threshold;
      bit = isLight;
      newPixel = isLight ? 1 : 0;
    }

    bits[y][x] = bit;
    const quantError = oldPixel - newPixel;
    errorHistory.unshift(quantError);
    if (errorHistory.length > historyLength) {
      errorHistory.pop();
    }
  }

  return bits;
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
): MosaicTile[] => {
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

  const rnMap: number[][] = Array.from({ length: yCount }, () => Array.from({ length: xCount }, () => 1));
  const gnMap: number[][] = Array.from({ length: yCount }, () => Array.from({ length: xCount }, () => 1));
  const bnMap: number[][] = Array.from({ length: yCount }, () => Array.from({ length: xCount }, () => 1));
  const lumaMap: number[][] = Array.from({ length: yCount }, () => Array.from({ length: xCount }, () => 1));
  const alphaMap: number[][] = Array.from({ length: yCount }, () => Array.from({ length: xCount }, () => 0));

  for (let gy = 0; gy < yCount; gy += 1) {
    for (let gx = 0; gx < xCount; gx += 1) {
      const x = bounds.left + xRemainder / 2 + gx * pixelSize;
      const yTop = bounds.top - yRemainder / 2 - gy * pixelSize;
      const u = clamp01((x + pixelSize * 0.5 - bounds.left) / width);
      const v = clamp01((bounds.top - (yTop - pixelSize * 0.5)) / height);
      const du = clamp01(pixelSize / width);
      const dv = clamp01(pixelSize / height);

      const { r, g, b, alpha } = sampleRgbaAlpha(u, v, du, dv);
      alphaMap[gy][gx] = alpha;
      if (alpha <= options.backgroundThreshold) {
        continue;
      }

      const rn = normalizeWithTone(r / 255, options.gamma, options.blackPoint, options.whitePoint);
      const gn = normalizeWithTone(g / 255, options.gamma, options.blackPoint, options.whitePoint);
      const bn = normalizeWithTone(b / 255, options.gamma, options.blackPoint, options.whitePoint);
      const effectiveRn = clamp01(rn * alpha + (1 - alpha));
      const effectiveGn = clamp01(gn * alpha + (1 - alpha));
      const effectiveBn = clamp01(bn * alpha + (1 - alpha));
      rnMap[gy][gx] = effectiveRn;
      gnMap[gy][gx] = effectiveGn;
      bnMap[gy][gx] = effectiveBn;
      lumaMap[gy][gx] = clamp01(0.299 * effectiveRn + 0.587 * effectiveGn + 0.114 * effectiveBn);
    }
  }

  const useDiffusion = isErrorDiffusionPattern(options.pattern);
  const usePathDiffusion = isPathDiffusionPattern(options.pattern);
  const threshold = clamp01(options.threshold);
  const diffusionKernel = useDiffusion ? getDiffusionKernel(options.pattern) : null;
  const monoBits = useDiffusion
    ? diffuseBinary(lumaMap, threshold, options.invert, "dark", diffusionKernel as DiffusionKernel)
    : usePathDiffusion
      ? riemersmaDiffuse(lumaMap, threshold, options.invert, "dark", xCount, yCount)
      : null;
  const rBits = useDiffusion
    ? diffuseBinary(rnMap, threshold, options.invert, "light", diffusionKernel as DiffusionKernel)
    : usePathDiffusion
      ? riemersmaDiffuse(rnMap, threshold, options.invert, "light", xCount, yCount)
      : null;
  const gBits = useDiffusion
    ? diffuseBinary(gnMap, threshold, options.invert, "light", diffusionKernel as DiffusionKernel)
    : usePathDiffusion
      ? riemersmaDiffuse(gnMap, threshold, options.invert, "light", xCount, yCount)
      : null;
  const bBits = useDiffusion
    ? diffuseBinary(bnMap, threshold, options.invert, "light", diffusionKernel as DiffusionKernel)
    : usePathDiffusion
      ? riemersmaDiffuse(bnMap, threshold, options.invert, "light", xCount, yCount)
      : null;

  const tiles: MosaicTile[] = [];
  for (let gy = 0; gy < yCount; gy += 1) {
    for (let gx = 0; gx < xCount; gx += 1) {
      const x = bounds.left + xRemainder / 2 + gx * pixelSize;
      const yTop = bounds.top - yRemainder / 2 - gy * pixelSize;
      const alpha = alphaMap[gy][gx];
      if (alpha <= options.backgroundThreshold) {
        continue;
      }

      if (options.colorMode === "mono") {
        const on = useDiffusion || usePathDiffusion
          ? (monoBits as boolean[][])[gy][gx]
          : (() => {
              const p = patternValue(options.pattern, gx, gy);
              const cutoff = clamp01(options.threshold + (p - 0.5) * 0.25);
              const effectiveLuma = lumaMap[gy][gx];
              return options.invert ? effectiveLuma >= cutoff : effectiveLuma <= cutoff;
            })();
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
        const rgbBits = useDiffusion || usePathDiffusion
          ? {
              r: (rBits as boolean[][])[gy][gx],
              g: (gBits as boolean[][])[gy][gx],
              b: (bBits as boolean[][])[gy][gx],
            }
          : (() => {
              const p = patternValue(options.pattern, gx, gy);
              const cutoff = clamp01(options.threshold + (p - 0.5) * 0.25);
              const rn = rnMap[gy][gx];
              const gn = gnMap[gy][gx];
              const bn = bnMap[gy][gx];
              return {
                r: options.invert ? rn < cutoff : rn > cutoff,
                g: options.invert ? gn < cutoff : gn > cutoff,
                b: options.invert ? bn < cutoff : bn > cutoff,
              };
            })();
        const rBit = rgbBits.r;
        const gBit = rgbBits.g;
        const bBit = rgbBits.b;
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
