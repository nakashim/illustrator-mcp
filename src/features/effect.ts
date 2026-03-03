import z from "zod";

import { server } from "../server";
import { generateHalftoneDots, parseLengthToPt, suggestHalftoneParams } from "../core/halftone";
import type { HalftoneOptions, HalftoneProfile } from "../core/halftone";
import { drawHalftoneDots, getPlacedImageInfo } from "../adapters/illustrator";
import { createCellAverageSampler, readImageBitmap, readImageSize } from "../adapters/image";

type HalftoneSuggestionInput = {
  targetUuid: string;
  baselinePx?: number;
  profile?: HalftoneProfile;
  baseDotSpacing?: string;
  baseMinDotSize?: string;
  baseMaxDotSize?: string;
};

const suggestHalftoneSchema = {
  targetUuid: z.string().describe("UUID of a placed image item"),
  baselinePx: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Baseline long-edge size in px for scaling recommendations (default: 1200)"),
  profile: z
    .enum(["light", "standard", "quality"])
    .optional()
    .describe("Recommended profile to use as primary output"),
  baseDotSpacing: z
    .string()
    .optional()
    .describe("Base dot spacing to scale (default: 5pt)"),
  baseMinDotSize: z
    .string()
    .optional()
    .describe("Base min dot size to scale (default: 0.35pt)"),
  baseMaxDotSize: z
    .string()
    .optional()
    .describe("Base max dot size to scale (default: 4.6pt)"),
};

const halftoneSchema = {
  targetUuid: z.string().describe("UUID of a placed image item"),
  dotSpacing: z
    .string()
    .optional()
    .describe("Dot spacing (mm/Q/pt). Default: 2mm"),
  minDotSize: z
    .string()
    .optional()
    .describe("Minimum dot diameter (mm/Q/pt). Default: 0.2mm"),
  maxDotSize: z
    .string()
    .optional()
    .describe("Maximum dot diameter (mm/Q/pt). Default: 1.6mm"),
  angleDeg: z.number().optional().describe("Halftone screen angle. Default: 45"),
  contrast: z
    .number()
    .min(-100)
    .max(100)
    .optional()
    .describe("Contrast adjustment (-100 to 100). Default: 0"),
  gamma: z
    .number()
    .min(0.1)
    .max(5)
    .optional()
    .describe("Gamma adjustment (0.1 to 5). Default: 1"),
  dotScale: z
    .number()
    .min(0)
    .max(3)
    .optional()
    .describe("Dot intensity scale multiplier. Default: 1"),
  backgroundThreshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Skip dots below this effective darkness. Default: 0.06"),
  invert: z.boolean().optional().describe("Invert brightness mapping"),
  maxDots: z.number().int().min(100).max(100000).optional(),
  colorCmyk: z
    .array(z.number())
    .length(4)
    .optional()
    .describe("Dot color as CMYK percentages"),
  groupName: z.string().optional().describe("Output group name"),
};

server.tool(
  "suggest_halftone_params",
  "Suggest halftone_vector parameters based on image size and placement.",
  suggestHalftoneSchema,
  async ({
    targetUuid,
    baselinePx,
    profile,
    baseDotSpacing,
    baseMinDotSize,
    baseMaxDotSize,
  }: HalftoneSuggestionInput) => {
    const item = getPlacedImageInfo(targetUuid);
    if (!item.filePath) {
      throw new Error("Target item has no linked file path.");
    }

    const { width: widthPx, height: heightPx } = await readImageSize(item.filePath);
    const baseline = baselinePx ?? 1200;
    const scaleFactor = Math.max(widthPx, heightPx) / baseline;

    const suggestions = suggestHalftoneParams({
      scaleFactor,
      placedWidthPt: item.bounds.right - item.bounds.left,
      placedHeightPt: item.bounds.top - item.bounds.bottom,
      baseDotSpacingPt: parseLengthToPt(baseDotSpacing ?? "5pt"),
      baseMinDotSizePt: parseLengthToPt(baseMinDotSize ?? "0.35pt"),
      baseMaxDotSizePt: parseLengthToPt(baseMaxDotSize ?? "4.6pt"),
    });

    const selectedProfile = profile ?? "standard";
    const selected = suggestions[selectedProfile];
    const recommendedArgs = {
      targetUuid,
      dotSpacing: selected.dotSpacing,
      minDotSize: selected.minDotSize,
      maxDotSize: selected.maxDotSize,
      angleDeg: selected.defaults.angleDeg,
      contrast: selected.defaults.contrast,
      gamma: selected.defaults.gamma,
      dotScale: selected.defaults.dotScale,
      backgroundThreshold: selected.defaults.backgroundThreshold,
      maxDots: selected.maxDots,
      invert: selected.defaults.invert,
      colorCmyk: selected.defaults.colorCmyk,
      groupName: `Halftone_${selectedProfile}`,
    };

    return {
      content: [
        {
          type: "text",
          text: `Suggested successfully.\n\n${JSON.stringify({
            targetUuid,
            pixelSize: { width: widthPx, height: heightPx, longEdge: Math.max(widthPx, heightPx) },
            baselinePx: baseline,
            scaleFactor,
            selectedProfile,
            recommendedArgs,
            profiles: suggestions,
            note:
              "Suggestions are advisory. You can override any parameter before running halftone_vector.",
          })}`,
        },
      ],
    };
  }
);

server.tool(
  "halftone_vector",
  "Create vector halftone dots from a placed image item.",
  halftoneSchema,
  async ({
    targetUuid,
    dotSpacing,
    minDotSize,
    maxDotSize,
    angleDeg,
    contrast,
    gamma,
    dotScale,
    backgroundThreshold,
    invert,
    maxDots,
    colorCmyk,
    groupName,
  }) => {
    const item = getPlacedImageInfo(targetUuid);

    if (!item.filePath) {
      throw new Error(
        "Target item has no linked file path. Use a linked placed image for halftone."
      );
    }

    const image = await readImageBitmap(item.filePath);
    const options: HalftoneOptions = {
      dotSpacingPt: parseLengthToPt(dotSpacing ?? "2mm"),
      minRadiusPt: parseLengthToPt(minDotSize ?? "0.2mm") / 2,
      maxRadiusPt: parseLengthToPt(maxDotSize ?? "1.6mm") / 2,
      angleDeg: angleDeg ?? 45,
      invert: invert ?? false,
      contrast: contrast ?? 0,
      gamma: gamma ?? 1,
      dotScale: dotScale ?? 1,
      backgroundThreshold: backgroundThreshold ?? 0.06,
      maxDots: maxDots ?? 2500,
    };

    const sampler = createCellAverageSampler(image, 3);
    const dots = generateHalftoneDots(item.bounds, options, sampler);

    const drawResult = drawHalftoneDots(
      dots,
      (colorCmyk as [number, number, number, number] | undefined) ?? [0, 0, 0, 100],
      groupName ?? "HalftoneVector"
    );

    return {
      content: [
        {
          type: "text",
          text: `Halftone vector created.\n\n${drawResult}`,
        },
      ],
    };
  }
);
