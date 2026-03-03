import { describe, expect, it } from "vitest";

import {
  applyToneAdjustments,
  generateHalftoneDots,
  parseLengthToPt,
} from "./effect";

describe("halftone helpers", () => {
  it("parses mm and Q lengths to points", () => {
    expect(parseLengthToPt("25.4mm")).toBeCloseTo(72, 4);
    expect(parseLengthToPt("4Q")).toBeCloseTo(2.8346, 3);
    expect(parseLengthToPt("12pt")).toBeCloseTo(12, 4);
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
      },
      () => 0.5
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
});
