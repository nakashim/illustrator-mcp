import { clamp01 } from "./units";
import type { HalftoneOptions } from "./types";

type ToneOptions = Pick<
  HalftoneOptions,
  "contrast" | "gamma" | "dotScale" | "invert"
>;

export const applyToneAdjustments = (luma: number, tone: ToneOptions) => {
  let adjusted = clamp01(luma);

  // Contrast range expected in [-100, 100].
  const contrast = Math.max(-100, Math.min(100, tone.contrast));
  if (contrast !== 0) {
    const c255 = contrast * 2.55;
    const factor = (259 * (c255 + 255)) / (255 * (259 - c255));
    adjusted = clamp01(factor * (adjusted - 0.5) + 0.5);
  }

  // Gamma > 1 brightens mid-tones here by using inverse exponent.
  const gamma = Math.max(0.1, tone.gamma);
  adjusted = clamp01(Math.pow(adjusted, 1 / gamma));

  let darkness = 1 - adjusted;
  if (tone.invert) {
    darkness = 1 - darkness;
  }

  return clamp01(darkness * Math.max(0, tone.dotScale));
};
