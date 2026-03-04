import { describe, expect, it } from "vitest";

import { generateDitherTiles } from "./index";

describe("generateDitherTiles", () => {
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
