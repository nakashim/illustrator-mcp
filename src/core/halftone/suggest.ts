import { clamp, formatPt } from "./units";
import type { HalftoneProfile } from "./types";

export const suggestHalftoneParams = (params: {
  scaleFactor: number;
  placedWidthPt: number;
  placedHeightPt: number;
  baseDotSpacingPt: number;
  baseMinDotSizePt: number;
  baseMaxDotSizePt: number;
}) => {
  const { scaleFactor, placedWidthPt, placedHeightPt } = params;

  const buildProfile = (
    profile: HalftoneProfile,
    spacingMul: number,
    minMul: number,
    maxMul: number,
    maxDots: number
  ) => {
    const spacingPt = clamp(
      params.baseDotSpacingPt * scaleFactor * spacingMul,
      2.5,
      14
    );
    const minPt = clamp(params.baseMinDotSizePt * scaleFactor * minMul, 0.15, 2.5);
    const maxPt = clamp(params.baseMaxDotSizePt * scaleFactor * maxMul, 1.2, 12);
    const estimatedGridCount =
      Math.max(1, Math.floor(placedWidthPt / spacingPt)) *
      Math.max(1, Math.floor(placedHeightPt / spacingPt));

    return {
      profile,
      dotSpacing: formatPt(spacingPt),
      minDotSize: formatPt(minPt),
      maxDotSize: formatPt(maxPt),
      maxDots,
      estimatedGridCount,
      mayHitMaxDots: estimatedGridCount > maxDots,
      defaults: {
        angleDeg: 0,
        contrast: 14,
        gamma: 1.1,
        dotScale: 1.15,
        backgroundThreshold: 0.04,
        invert: false,
        colorCmyk: [0, 0, 0, 100],
      },
    };
  };

  return {
    light: buildProfile("light", 1.25, 1.0, 0.85, 30000),
    standard: buildProfile("standard", 1.0, 1.0, 1.0, 60000),
    quality: buildProfile("quality", 0.85, 1.05, 1.1, 100000),
  };
};
