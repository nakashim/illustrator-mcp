import z from "zod";

import { server } from "../server";
import { formatPt, parseLengthToPt } from "../core/halftone";
import {
  changeImages,
  getPlacedImageInfo,
  listImages,
  placeImages,
} from "../adapters/illustrator";
import type { ImageChangeInput } from "../adapters/illustrator";
import { readImageSize } from "../adapters/image";

type InspectImageInput = {
  targetUuid: string;
  baselinePx?: number;
  baseDotSpacing?: string;
  baseMinDotSize?: string;
  baseMaxDotSize?: string;
};

export const computeScaleFactor = (pixelWidth: number, pixelHeight: number, baselinePx: number) => {
  const longEdge = Math.max(pixelWidth, pixelHeight);
  if (baselinePx <= 0) {
    return 1;
  }
  return longEdge / baselinePx;
};

server.tool(
  "create_images",
  "Places multiple images in the document.",
  { paths: z.array(z.string()).describe("Absolute image paths.") },
  async ({ paths }) => {
    const output = placeImages(paths);
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
    const output = listImages();
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
    const info = getPlacedImageInfo(targetUuid);

    if (!info.filePath) {
      throw new Error("Target item has no linked file path.");
    }

    const { width: widthPx, height: heightPx } = await readImageSize(info.filePath);
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
    changeImages(changes as ImageChangeInput[]);
    return {
      content: [{ type: "text", text: "Changed successfully." }],
    };
  }
);
