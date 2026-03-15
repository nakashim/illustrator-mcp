import { describe, expect, it } from "vitest";

import { generateDitherTiles } from "./index";

describe("generateDitherTiles", () => {
  it("supports bayer2 pattern", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 20, right: 20, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 1000,
        threshold: 0.5,
        invert: false,
        pattern: "bayer2",
        backgroundThreshold: 0,
        colorMode: "mono",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      () => ({ r: 90, g: 90, b: 90, alpha: 1 })
    );
    // 2x2 pattern should still produce a stable subset.
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(4);
  });

  it("supports clustered_4x4 pattern", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 40, right: 40, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 1000,
        threshold: 0.5,
        invert: false,
        pattern: "clustered_4x4",
        backgroundThreshold: 0,
        colorMode: "mono",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      () => ({ r: 110, g: 110, b: 110, alpha: 1 })
    );
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(16);
  });

  it("supports blue-noise pattern", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 40, right: 40, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 1000,
        threshold: 0.5,
        invert: false,
        pattern: "blue-noise",
        backgroundThreshold: 0,
        colorMode: "mono",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      () => ({ r: 120, g: 120, b: 120, alpha: 1 })
    );
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(16);
  });

  it("supports floyd-steinberg error diffusion", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 10000,
        threshold: 0.5,
        invert: false,
        pattern: "floyd-steinberg",
        backgroundThreshold: 0,
        colorMode: "mono",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      (u) => {
        const shade = Math.round(255 * (0.2 + u * 0.6));
        return { r: shade, g: shade, b: shade, alpha: 1 };
      }
    );
    expect(tiles.length).toBeGreaterThan(0);
  });

  it("supports atkinson error diffusion", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 10000,
        threshold: 0.5,
        invert: false,
        pattern: "atkinson",
        backgroundThreshold: 0,
        colorMode: "mono",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      (_u, v) => {
        const shade = Math.round(255 * (0.2 + v * 0.6));
        return { r: shade, g: shade, b: shade, alpha: 1 };
      }
    );
    expect(tiles.length).toBeGreaterThan(0);
  });

  it("supports riemersma path diffusion", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 10000,
        threshold: 0.5,
        invert: false,
        pattern: "riemersma",
        backgroundThreshold: 0,
        colorMode: "mono",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      (u, v) => {
        const shade = Math.round(255 * (0.15 + (u + v) * 0.35));
        return { r: shade, g: shade, b: shade, alpha: 1 };
      }
    );
    expect(tiles.length).toBeGreaterThan(0);
  });

  it("generates monochrome tiles with bayer pattern", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 10000,
        threshold: 0.5,
        invert: false,
        pattern: "bayer4",
        backgroundThreshold: 0,
        colorMode: "mono",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      () => ({ r: 80, g: 80, b: 80, alpha: 1 })
    );
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].fillCmyk).toEqual([0, 0, 0, 100]);
  });

  it("respects background threshold", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 10000,
        threshold: 0.5,
        invert: false,
        pattern: "random",
        backgroundThreshold: 0.2,
        colorMode: "mono",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      () => ({ r: 20, g: 20, b: 20, alpha: 0.1 })
    );
    expect(tiles.length).toBe(0);
  });

  it("supports rgb mode with bayer8", () => {
    const tiles = generateDitherTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        pixelSizePt: 10,
        maxTiles: 10000,
        threshold: 0.5,
        invert: false,
        pattern: "bayer8",
        backgroundThreshold: 0,
        colorMode: "rgb",
        gamma: 1,
        blackPoint: 0,
        whitePoint: 1,
      },
      () => ({ r: 220, g: 80, b: 40, alpha: 1 })
    );
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.some((t) => t.fillCmyk[0] > 0 || t.fillCmyk[1] > 0 || t.fillCmyk[2] > 0)).toBe(
      true
    );
  });

});
