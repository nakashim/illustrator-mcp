import { Jimp, intToRGBA } from "jimp";
import z from "zod";

import { executeExtendScript } from "../extend-utils/utils";
import { server } from "../server";

type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type Dot = {
  x: number;
  y: number;
  r: number;
};

type HalftoneOptions = {
  dotSpacingPt: number;
  minRadiusPt: number;
  maxRadiusPt: number;
  angleDeg: number;
  maxDots: number;
  invert: boolean;
  contrast: number;
  gamma: number;
  dotScale: number;
  backgroundThreshold: number;
};

type PlacedItemInfo = {
  uuid: string;
  typename: string;
  filePath: string;
  bounds: Bounds;
};

type HalftoneProfile = "light" | "standard" | "quality";

type HalftoneSuggestionInput = {
  targetUuid: string;
  baselinePx?: number;
  profile?: HalftoneProfile;
  baseDotSpacing?: string;
  baseMinDotSize?: string;
  baseMaxDotSize?: string;
};

export const parseLengthToPt = (value: string): number => {
  const input = value.trim();
  if (input.endsWith("mm")) {
    return (parseFloat(input.slice(0, -2)) * 72) / 25.4;
  }
  if (input.endsWith("Q")) {
    return (parseFloat(input.slice(0, -1)) / 4 / 25.4) * 72;
  }
  if (input.endsWith("pt")) {
    return parseFloat(input.slice(0, -2));
  }
  return parseFloat(input);
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const hash32 = (value: number) => {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const formatPt = (value: number) => `${value.toFixed(3)}pt`;

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

type ToneOptions = Pick<HalftoneOptions, "contrast" | "gamma" | "dotScale" | "invert">;

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

export const generateHalftoneDots = (
  bounds: Bounds,
  options: HalftoneOptions,
  sampleLumaAlpha: (
    u: number,
    v: number,
    du: number,
    dv: number
  ) => { luma: number; alpha: number }
) => {
  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid target bounds for halftone.");
  }

  const angle = (options.angleDeg * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const spacing = options.dotSpacingPt;
  const spacingX = spacing;
  const spacingY = spacing;
  const xCount = Math.max(1, Math.floor(width / spacingX));
  const yCount = Math.max(1, Math.floor(height / spacingY));
  const xRemainder = width - xCount * spacingX;
  const yRemainder = height - yCount * spacingY;
  const maxRadiusPt = Math.min(options.maxRadiusPt, spacing * 0.45);
  const minRadiusPt = Math.min(options.minRadiusPt, maxRadiusPt);

  const dots: Dot[] = [];
  for (let gy = 1; gy <= yCount; gy += 1) {
    for (let gx = 1; gx <= xCount; gx += 1) {
      const baseX = bounds.left + gx * spacingX - spacingX / 2 + xRemainder / 2;
      const baseY = bounds.top - (gy * spacingY - spacingY / 2 + yRemainder / 2);

      const dx = baseX - centerX;
      const dy = baseY - centerY;
      const x = centerX + cos * dx - sin * dy;
      const y = centerY + sin * dx + cos * dy;
      if (x < bounds.left || x > bounds.right || y < bounds.bottom || y > bounds.top) {
        continue;
      }

      const u = clamp01((x - bounds.left) / width);
      const v = clamp01((bounds.top - y) / height);
      const du = clamp01(spacingX / width);
      const dv = clamp01(spacingY / height);
      const { luma, alpha } = sampleLumaAlpha(u, v, du, dv);
      const toneDarkness = applyToneAdjustments(luma, options);
      const darkness = clamp01(toneDarkness * clamp01(alpha));
      if (darkness <= options.backgroundThreshold) {
        continue;
      }

      const r = Math.max(minRadiusPt, darkness * maxRadiusPt);
      if (r <= 0.05) {
        continue;
      }

      dots.push({
        // x/y is already on the rotated screen grid.
        x,
        y,
        r,
      });
    }
  }

  if (dots.length <= options.maxDots) {
    return dots;
  }

  // Downsample deterministically using coordinate-based hashing to reduce stripe artifacts.
  const ranked = dots
    .map((dot, i) => {
      const key = hash32((Math.round(dot.x * 10) * 73856093) ^ (Math.round(dot.y * 10) * 19349663) ^ i);
      return { key, dot };
    })
    .sort((a, b) => a.key - b.key)
    .slice(0, options.maxDots)
    .map((entry) => entry.dot);

  return ranked;
};

const buildPlacedItemInfoScript = (uuid: string) => `
var item = getPageItem("${uuid}");
if (!item) {
  throw new Error("Target item not found: ${uuid}");
}
var bounds = item.geometricBounds;
var filePath = "";
try {
  if (item.file) {
    filePath = item.file.fsName || item.file.fullName || item.file.absoluteURI || item.file.toString();
  }
} catch (e) {
  filePath = "";
}
JSON.stringify({
  uuid: item.note,
  typename: item.typename,
  filePath: filePath,
  bounds: {
    left: bounds[0],
    top: bounds[1],
    right: bounds[2],
    bottom: bounds[3]
  }
});
`;

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

const buildDrawHalftoneScript = (
  dots: Dot[],
  cmyk: [number, number, number, number],
  groupName: string
) => `
var doc = getDocument();
var dots = ${JSON.stringify(dots)};
var group = doc.groupItems.add();
group.note = createUUID();
group.name = ${JSON.stringify(groupName)};

var color = new CMYKColor();
color.cyan = ${cmyk[0]};
color.magenta = ${cmyk[1]};
color.yellow = ${cmyk[2]};
color.black = ${cmyk[3]};

for (var i = 0; i < dots.length; i++) {
  var d = dots[i];
  var circle = doc.pathItems.ellipse(d.y + d.r, d.x - d.r, d.r * 2, d.r * 2);
  circle.stroked = false;
  circle.filled = true;
  circle.fillColor = color;
  circle.note = createUUID();
  circle.moveToBeginning(group);
}

JSON.stringify({
  groupUuid: group.note,
  groupName: group.name,
  dotCount: dots.length
});
`;

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
    const itemInfoText = executeExtendScript(buildPlacedItemInfoScript(targetUuid));
    const item = JSON.parse(itemInfoText) as PlacedItemInfo;
    if (!item.filePath) {
      throw new Error("Target item has no linked file path.");
    }

    const image = await Jimp.read(item.filePath);
    const widthPx = image.bitmap.width;
    const heightPx = image.bitmap.height;
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
    const itemInfoText = executeExtendScript(buildPlacedItemInfoScript(targetUuid));
    const item = JSON.parse(itemInfoText) as PlacedItemInfo;

    if (!item.filePath) {
      throw new Error(
        "Target item has no linked file path. Use a linked placed image for halftone."
      );
    }

    const image = await Jimp.read(item.filePath);
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

    const dots = generateHalftoneDots(item.bounds, options, (u, v, du, dv) => {
      // Cell-average sampling using a compact 3x3 grid reduces center bias and noise.
      let sumLuma = 0;
      let sumAlpha = 0;
      let count = 0;
      const grid = 3;
      for (let gy = 0; gy < grid; gy += 1) {
        for (let gx = 0; gx < grid; gx += 1) {
          const su = clamp01(u + ((gx / (grid - 1)) - 0.5) * du);
          const sv = clamp01(v + ((gy / (grid - 1)) - 0.5) * dv);
          const x = Math.min(
            image.bitmap.width - 1,
            Math.max(0, Math.round(su * (image.bitmap.width - 1)))
          );
          const y = Math.min(
            image.bitmap.height - 1,
            Math.max(0, Math.round(sv * (image.bitmap.height - 1)))
          );
          const rgba = intToRGBA(image.getPixelColor(x, y));
          sumLuma += (0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b) / 255;
          sumAlpha += rgba.a / 255;
          count += 1;
        }
      }
      if (count <= 0) {
        return { luma: 1, alpha: 0 };
      }
      return {
        luma: sumLuma / count,
        alpha: sumAlpha / count,
      };
    });

    const drawResult = executeExtendScript(
      buildDrawHalftoneScript(
        dots,
        (colorCmyk as [number, number, number, number] | undefined) ?? [
          0, 0, 0, 100,
        ],
        groupName ?? "HalftoneVector"
      ),
      { timeoutMs: 180_000, retries: 1 }
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
