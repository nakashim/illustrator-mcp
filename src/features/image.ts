import z from "zod";
import { Jimp } from "jimp";

import { server } from "../server";
import { executeExtendScript } from "../extend-utils/utils";

type InspectImageInput = {
  targetUuid: string;
  baselinePx?: number;
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

export const formatPt = (value: number) => `${value.toFixed(3)}pt`;

export const computeScaleFactor = (pixelWidth: number, pixelHeight: number, baselinePx: number) => {
  const longEdge = Math.max(pixelWidth, pixelHeight);
  if (baselinePx <= 0) {
    return 1;
  }
  return longEdge / baselinePx;
};

const buildInspectImageScript = (uuid: string) => `
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
  widthPt: item.width,
  heightPt: item.height,
  bounds: {
    left: bounds[0],
    top: bounds[1],
    right: bounds[2],
    bottom: bounds[3]
  }
});
`;

server.tool(
  "create_images",
  "Places multiple images in the document.",
  { paths: z.array(z.string()).describe("Absolute image paths.") },
  async ({ paths }) => {
    const script = `
var doc = getDocument();
var paths = ${JSON.stringify(paths)};
var result = [];
for (var i = 0; i < paths.length; i++) {
  var image = doc.placedItems.add();
  image.file = new File(paths[i]);
  image.note = createUUID();
  result.push({ uuid: image.note });
}
JSON.stringify(result);
`;
    const output = executeExtendScript(script);
    return {
      content: [
        {
          type: "text",
          text: `Placed successfully.\n\n${output}`,
        },
      ],
    };
  }
);

server.tool(
  "list_images",
  "Gets information of existing images.",
  {},
  async () => {
    const script = `
var doc = getDocument();
var result = [];
for (var i = 0; i < doc.placedItems.length; i++) {
  var item = doc.placedItems[i];
  if (!item.note) {
    item.note = createUUID();
  }
  result.push({
    uuid: item.note,
    path: item.file.name,
    x: ptToMm(item.left),
    y: ptToMm(-item.top),
    width: ptToMm(item.width),
    height: ptToMm(item.height),
    selected: item.selected,
  });
}
JSON.stringify(result);
`;
    const output = executeExtendScript(script);
    return {
      content: [{ type: "text", text: `Retrieved successfully.\n\n${output}` }],
    };
  }
);

server.tool(
  "inspect_image",
  "Inspect an image and return size + suggested halftone scaling.",
  {
    targetUuid: z.string().describe("UUID of a placed image item"),
    baselinePx: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Baseline long-edge size in px for scaling recommendations (default: 1200)"),
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
  },
  async ({
    targetUuid,
    baselinePx,
    baseDotSpacing,
    baseMinDotSize,
    baseMaxDotSize,
  }: InspectImageInput) => {
    const infoText = executeExtendScript(buildInspectImageScript(targetUuid));
    const info = JSON.parse(infoText) as {
      uuid: string;
      typename: string;
      filePath: string;
      widthPt: number;
      heightPt: number;
      bounds: { left: number; top: number; right: number; bottom: number };
    };

    if (!info.filePath) {
      throw new Error("Target item has no linked file path.");
    }

    const image = await Jimp.read(info.filePath);
    const widthPx = image.bitmap.width;
    const heightPx = image.bitmap.height;
    const baseline = baselinePx ?? 1200;
    const scaleFactor = computeScaleFactor(widthPx, heightPx, baseline);

    const baseSpacingPt = parseLengthToPt(baseDotSpacing ?? "5pt");
    const baseMinPt = parseLengthToPt(baseMinDotSize ?? "0.35pt");
    const baseMaxPt = parseLengthToPt(baseMaxDotSize ?? "4.6pt");

    const suggestedSpacingPt = baseSpacingPt * scaleFactor;
    const suggestedMinPt = baseMinPt * scaleFactor;
    const suggestedMaxPt = baseMaxPt * scaleFactor;

    // Approximate dot count before threshold/drop, useful for safety planning.
    const estimatedGridCount =
      Math.max(1, Math.floor(info.widthPt / suggestedSpacingPt)) *
      Math.max(1, Math.floor(info.heightPt / suggestedSpacingPt));

    const payload = {
      uuid: info.uuid,
      filePath: info.filePath,
      pixelSize: {
        width: widthPx,
        height: heightPx,
        longEdge: Math.max(widthPx, heightPx),
      },
      placedSizePt: {
        width: info.widthPt,
        height: info.heightPt,
      },
      scaling: {
        baselinePx: baseline,
        scaleFactor,
      },
      suggestedHalftone: {
        dotSpacing: formatPt(suggestedSpacingPt),
        minDotSize: formatPt(suggestedMinPt),
        maxDotSize: formatPt(suggestedMaxPt),
        estimatedGridCount,
      },
      note:
        "Suggestions are optional. You can keep full manual control by overriding any value.",
    };

    return {
      content: [{ type: "text", text: `Inspected successfully.\n\n${JSON.stringify(payload)}` }],
    };
  }
);

const multipleImageChangeSchema = z
  .array(
    z.object({
      uuid: z.string().describe("UUID"),
      path: z.string().optional().describe("Absolute image path"),
      x: z
        .string()
        .optional()
        .describe("X coordinate (origin at top left, specify in mm or Q)"),
      y: z
        .string()
        .optional()
        .describe("Y coordinate (origin at top left, specify in mm or Q)"),
      width: z.string().optional().describe("Width (specify in mm or Q)"),
      height: z.string().optional().describe("Height (specify in mm or Q)"),
      maintainAspectRatio: z
        .boolean()
        .optional()
        .describe("Whether to maintain aspect ratio"),
    })
  )
  .describe("Array of UUIDs and attributes of images to change");

server.tool(
  "change_images",
  "Changes attributes of multiple images.",
  {
    changes: multipleImageChangeSchema,
  },
  async ({ changes }) => {
    const script = `
var inputs = ${JSON.stringify(changes)};

for (var i = 0; i < inputs.length; i++) {
  var item = getPageItem(inputs[i].uuid);
  if (inputs[i].path) {
    item.file = new File(inputs[i].path);
  }
  if (inputs[i].x) {
    item.left = toPt(inputs[i].x);
  }
  if (inputs[i].y) {
    item.top = -toPt(inputs[i].y);
  }
  if (inputs[i].width) {
    var afterWidth = toPt(inputs[i].width);
    if (inputs[i].maintainAspectRatio) {
      item.height = afterWidth * (item.height / item.width);
    }
    item.width = afterWidth;
  }
  if (inputs[i].height) {
    var afterHeight = toPt(inputs[i].height);
    if (inputs[i].maintainAspectRatio) {
      item.width = afterHeight * (item.width / item.height);
    }
    item.height = afterHeight;
  }
}
`;
    executeExtendScript(script);
    return {
      content: [{ type: "text", text: "Changed successfully." }],
    };
  }
);
