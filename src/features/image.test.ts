import { describe, expect, it } from "vitest";

import { formatPt, parseLengthToPt } from "../core/halftone";
import { computeScaleFactor } from "./image";

describe("image inspect helpers", () => {
  it("parses length units into pt", () => {
    expect(parseLengthToPt("25.4mm")).toBeCloseTo(72, 4);
    expect(parseLengthToPt("4Q")).toBeCloseTo(2.8346, 3);
    expect(parseLengthToPt("12pt")).toBeCloseTo(12, 4);
  });

  it("computes long-edge scale factor against baseline", () => {
    expect(computeScaleFactor(2400, 1200, 1200)).toBeCloseTo(2, 4);
    expect(computeScaleFactor(800, 600, 1200)).toBeCloseTo(0.6667, 3);
  });

  it("formats points with fixed precision", () => {
    expect(formatPt(4)).toBe("4.000pt");
    expect(formatPt(3.14159)).toBe("3.142pt");
  });
});
