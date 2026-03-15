import { describe, expect, it } from "vitest";

import { generateHalftoneDots } from "./generator";

const sampleOpaqueDark = () => ({ luma: 0, alpha: 1 });

describe("generateHalftoneDots", () => {
  it("covers full bounds even when angle is rotated", () => {
    const bounds = {
      left: 0,
      top: 80,
      right: 120,
      bottom: 0,
    };
    const spacing = 8;
    const dots = generateHalftoneDots(
      bounds,
      {
        dotSpacingPt: spacing,
        minRadiusPt: 0.5,
        maxRadiusPt: 3,
        angleDeg: 45,
        maxDots: 20000,
        invert: false,
        contrast: 0,
        gamma: 1,
        dotScale: 1,
        backgroundThreshold: 0,
      },
      sampleOpaqueDark
    );

    expect(dots.length).toBeGreaterThan(0);
    const edgeBand = spacing * 1.2;
    const hasLeft = dots.some((d) => d.x <= bounds.left + edgeBand);
    const hasRight = dots.some((d) => d.x >= bounds.right - edgeBand);
    const hasBottom = dots.some((d) => d.y <= bounds.bottom + edgeBand);
    const hasTop = dots.some((d) => d.y >= bounds.top - edgeBand);

    expect(hasLeft).toBe(true);
    expect(hasRight).toBe(true);
    expect(hasBottom).toBe(true);
    expect(hasTop).toBe(true);
  });
});
