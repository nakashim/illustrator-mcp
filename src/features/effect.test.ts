import { describe, expect, it } from "vitest";

import {
  applyToneAdjustments,
  generateHalftoneDots,
  parseLengthToPt,
  suggestHalftoneParams,
} from "../core/halftone";

describe("halftone helpers", () => {
  it("parses supported Illustrator-like units to points", () => {
    expect(parseLengthToPt("25.4mm")).toBeCloseTo(72, 4);
    expect(parseLengthToPt("4Q")).toBeCloseTo(2.8346, 3);
    expect(parseLengthToPt("12pt")).toBeCloseTo(12, 4);
    expect(parseLengthToPt("1pc")).toBeCloseTo(12, 4);
    expect(parseLengthToPt("2in")).toBeCloseTo(144, 4);
    expect(parseLengthToPt("0.5ft")).toBeCloseTo(432, 4);
    expect(parseLengthToPt("1yd")).toBeCloseTo(2592, 4);
    expect(parseLengthToPt("2.54cm")).toBeCloseTo(72, 4);
    expect(parseLengthToPt("0.001m")).toBeCloseTo(2.8346, 3);
    expect(parseLengthToPt("10px")).toBeCloseTo(10, 4);
    expect(parseLengthToPt("1H")).toBeCloseTo(parseLengthToPt("1Q"), 6);
    expect(parseLengthToPt("4h")).toBeCloseTo(parseLengthToPt("4Q"), 6);
    expect(parseLengthToPt(" 10 pt ")).toBeCloseTo(10, 4);
    expect(parseLengthToPt("5' 8\"")).toBeCloseTo(4896, 4);
    expect(parseLengthToPt("5ft 8in")).toBeCloseTo(4896, 4);
    expect(parseLengthToPt("-1' 6\"")).toBeCloseTo(-1296, 4);
    expect(parseLengthToPt("8\"")).toBeCloseTo(576, 4);
  });

  it("returns NaN for unsupported length units", () => {
    expect(Number.isNaN(parseLengthToPt("10p"))).toBe(true);
    expect(Number.isNaN(parseLengthToPt("abc"))).toBe(true);
  });

  it("generates dots within bounds", () => {
    const dots = generateHalftoneDots(
      {
        left: 0,
        top: 100,
        right: 100,
        bottom: 0,
      },
      {
        dotSpacingPt: 20,
        minRadiusPt: 1,
        maxRadiusPt: 4,
        angleDeg: 0,
        maxDots: 1000,
        invert: false,
        contrast: 0,
        gamma: 1,
        dotScale: 1,
        backgroundThreshold: 0.06,
      },
      () => ({ luma: 0.5, alpha: 1 })
    );

    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      expect(dot.x).toBeGreaterThanOrEqual(0);
      expect(dot.x).toBeLessThanOrEqual(100);
      expect(dot.y).toBeGreaterThanOrEqual(0);
      expect(dot.y).toBeLessThanOrEqual(100);
      expect(dot.r).toBeGreaterThan(0);
    }
  });

  it("applies tone controls to darkness", () => {
    const base = applyToneAdjustments(0.5, {
      contrast: 0,
      gamma: 1,
      dotScale: 1,
      invert: false,
    });
    const scaled = applyToneAdjustments(0.5, {
      contrast: 0,
      gamma: 1,
      dotScale: 1.5,
      invert: false,
    });
    const inverted = applyToneAdjustments(0.5, {
      contrast: 0,
      gamma: 1,
      dotScale: 1,
      invert: true,
    });

    expect(base).toBeGreaterThan(0);
    expect(scaled).toBeGreaterThan(base);
    expect(inverted).toBeCloseTo(1 - base, 4);
  });

  it("skips dots when alpha/background threshold removes them", () => {
    const dots = generateHalftoneDots(
      {
        left: 0,
        top: 100,
        right: 100,
        bottom: 0,
      },
      {
        dotSpacingPt: 20,
        minRadiusPt: 1,
        maxRadiusPt: 4,
        angleDeg: 0,
        maxDots: 1000,
        invert: false,
        contrast: 0,
        gamma: 1,
        dotScale: 1,
        backgroundThreshold: 0.06,
      },
      () => ({ luma: 1, alpha: 0 })
    );
    expect(dots.length).toBe(0);
  });

  it("suggests three halftone profiles with recommended limits", () => {
    const suggestions = suggestHalftoneParams({
      scaleFactor: 2,
      placedWidthPt: 2000,
      placedHeightPt: 2000,
      baseDotSpacingPt: 5,
      baseMinDotSizePt: 0.35,
      baseMaxDotSizePt: 4.6,
    });
    expect(suggestions.light.maxDots).toBe(30000);
    expect(suggestions.standard.maxDots).toBe(60000);
    expect(suggestions.quality.maxDots).toBe(100000);
    expect(suggestions.standard.dotSpacing.endsWith("pt")).toBe(true);
  });
});
