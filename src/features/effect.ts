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

export const generateHalftoneDots = (
  bounds: Bounds,
  options: HalftoneOptions,
  sampleLuma: (u: number, v: number) => number
) => {
  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid target bounds for halftone.");
  }

  let spacing = options.dotSpacingPt;
  let cols = Math.max(1, Math.floor(width / spacing) + 1);
  let rows = Math.max(1, Math.floor(height / spacing) + 1);
  const total = rows * cols;
  if (total > options.maxDots) {
    const scale = Math.sqrt(total / options.maxDots);
    spacing *= scale;
    cols = Math.max(1, Math.floor(width / spacing) + 1);
    rows = Math.max(1, Math.floor(height / spacing) + 1);
  }

  const angle = (options.angleDeg * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;

  const dots: Dot[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = bounds.left + col * spacing;
      const y = bounds.top - row * spacing;
      const u = clamp01((x - bounds.left) / width);
      const v = clamp01((bounds.top - y) / height);
      let luma = clamp01(sampleLuma(u, v));
      if (options.invert) {
        luma = 1 - luma;
      }

      const r =
        options.minRadiusPt +
        (1 - luma) * (options.maxRadiusPt - options.minRadiusPt);
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
      maxDots: maxDots ?? 2500,
    };

    const dots = generateHalftoneDots(item.bounds, options, (u, v) => {
      const x = Math.min(
        image.bitmap.width - 1,
        Math.max(0, Math.round(u * (image.bitmap.width - 1)))
      );
      const y = Math.min(
        image.bitmap.height - 1,
        Math.max(0, Math.round(v * (image.bitmap.height - 1)))
      );
      const rgba = intToRGBA(image.getPixelColor(x, y));
      return (0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b) / 255;
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
