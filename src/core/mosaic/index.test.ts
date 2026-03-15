import { describe, expect, it } from "vitest";

import { generateMosaicTiles } from "./index";

describe("generateMosaicTiles", () => {
  it("generates tiles within bounds", () => {
    const tiles = generateMosaicTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        tileSizePt: 20,
        gapPt: 0,
        cornerRadiusPt: 2,
        maxTiles: 1000,
        backgroundThreshold: 0,
        grayscale: false,
      },
      () => ({ r: 255, g: 0, b: 0, alpha: 1 })
    );
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x + tile.width).toBeLessThanOrEqual(100.0001);
      expect(tile.y).toBeLessThanOrEqual(100);
      expect(tile.y - tile.height).toBeGreaterThanOrEqual(-0.0001);
      expect(tile.fillCmyk.length).toBe(4);
    }
  });

  it("skips transparent tiles by threshold", () => {
    const tiles = generateMosaicTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        tileSizePt: 20,
        gapPt: 0,
        cornerRadiusPt: 0,
        maxTiles: 1000,
        backgroundThreshold: 0.5,
        grayscale: false,
      },
      () => ({ r: 200, g: 200, b: 200, alpha: 0.1 })
    );
    expect(tiles.length).toBe(0);
  });

  it("downsamples capped tiles across full height", () => {
    const tiles = generateMosaicTiles(
      { left: 0, top: 100, right: 100, bottom: 0 },
      {
        tileSizePt: 4,
        gapPt: 0,
        cornerRadiusPt: 0,
        maxTiles: 20,
        backgroundThreshold: 0,
        grayscale: false,
      },
      () => ({ r: 120, g: 120, b: 120, alpha: 1 })
    );
    expect(tiles.length).toBe(20);
    const ys = tiles.map((t) => t.y);
    expect(Math.max(...ys)).toBeGreaterThan(80); // upper area remains
    expect(Math.min(...ys)).toBeLessThan(30); // lower area also remains
  });

});
