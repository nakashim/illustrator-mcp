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
};

type PlacedItemInfo = {
  uuid: string;
  typename: string;
  filePath: string;
  bounds: Bounds;
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
  sampleLuma: (u: number, v: number, du: number, dv: number) => number
) => {
  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid target bounds for halftone.");
  }

  let spacing = options.dotSpacingPt;
  const estimateTotal = (s: number) => {
    const diagonal = Math.hypot(width, height);
    const span = diagonal + s;
    const count = Math.max(1, Math.floor(span / s) + 1);
    return count * count;
  };
  let estimated = estimateTotal(spacing);
  if (estimated > options.maxDots) {
    const scale = Math.sqrt(estimated / options.maxDots);
    spacing *= scale;
    estimated = estimateTotal(spacing);
  }

  const angle = (options.angleDeg * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const diagonal = Math.hypot(width, height);
  const halfSpan = diagonal / 2 + spacing;

  const dots: Dot[] = [];
  for (let sy = -halfSpan; sy <= halfSpan; sy += spacing) {
    for (let sx = -halfSpan; sx <= halfSpan; sx += spacing) {
      // Build a rotated dot lattice in "screen" space, then map to doc space.
      const x = centerX + cos * sx - sin * sy;
      const y = centerY + sin * sx + cos * sy;
      if (x < bounds.left || x > bounds.right || y < bounds.bottom || y > bounds.top) {
        continue;
      }

      const u = clamp01((x - bounds.left) / width);
      const v = clamp01((bounds.top - y) / height);
      const du = clamp01(spacing / width);
      const dv = clamp01(spacing / height);
      const luma = clamp01(sampleLuma(u, v, du, dv));
      const darkness = applyToneAdjustments(luma, options);

      const r =
        options.minRadiusPt +
        darkness * (options.maxRadiusPt - options.minRadiusPt);
      if (r <= 0.05) {
        continue;
      }

      const dx = x - centerX;
      const dy = y - centerY;
      dots.push({
        x: centerX + cos * dx - sin * dy,
        y: centerY + sin * dx + cos * dy,
        r,
      });
    }
  }

  return dots;
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
  invert: z.boolean().optional().describe("Invert brightness mapping"),
  maxDots: z.number().int().min(100).max(20000).optional(),
  colorCmyk: z
    .array(z.number())
    .length(4)
    .optional()
    .describe("Dot color as CMYK percentages"),
  groupName: z.string().optional().describe("Output group name"),
};

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
      maxDots: maxDots ?? 2500,
    };

    const dots = generateHalftoneDots(item.bounds, options, (u, v, du, dv) => {
      // Cell-average sampling using a compact 3x3 grid reduces center bias and noise.
      let sum = 0;
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
          sum += (0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b) / 255;
          count += 1;
        }
      }
      return count > 0 ? sum / count : 1;
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
