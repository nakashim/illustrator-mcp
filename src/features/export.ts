import z from "zod";

import {
  exportArtifactWithFallback,
  exportSelectionWithFallback,
} from "../adapters/illustrator";
import { server } from "../server";

const exportFormatSchema = z.enum(["svg", "pdf", "png"]);

const exportOptionsSchema = z
  .object({
    embedRasterImages: z.boolean().optional(),
    precision: z.number().min(1).max(7).optional(),
    compressed: z.boolean().optional(),
    antiAliasing: z.boolean().optional(),
    transparency: z.boolean().optional(),
    artBoardClipping: z.boolean().optional(),
    scalePercent: z.number().min(1).max(1000).optional(),
  })
  .optional();

server.tool(
  "export_artifact",
  "Export the document to SVG, PDF, or PNG.",
  {
    path: z.string().describe("Absolute output path"),
    format: exportFormatSchema.describe("Export format"),
    options: exportOptionsSchema.describe("Optional export settings"),
  },
  async ({ path, format, options }) => {
    const { outputPath, output, timedOutWithFile } = exportArtifactWithFallback(
      path,
      format,
      options
    );

    if (timedOutWithFile) {
      return {
        content: [
          {
            type: "text",
            text: `Export completed, but Illustrator response timed out.\n\n${JSON.stringify({
              path: outputPath,
              requestedPath: path,
              format,
              warning:
                "osascript response timed out after export. File existence was verified.",
            })}`,
          },
        ],
      };
    }

    // Return normalized path so callers know where compressed SVG was written.
    const resultText = output.trim()
      ? output
      : JSON.stringify({
          path: outputPath,
          requestedPath: path,
          format,
          options: options ?? {},
        });

    return {
      content: [{ type: "text", text: `Exported successfully.\n\n${resultText}` }],
    };
  }
);

server.tool(
  "export_selection",
  "Export selected page items (by UUIDs) to SVG, PDF, or PNG.",
  {
    uuids: z.array(z.string()).min(1).describe("PageItem UUIDs to export"),
    path: z.string().describe("Absolute output path"),
    format: exportFormatSchema.describe("Export format"),
    options: exportOptionsSchema.describe("Optional export settings"),
  },
  async ({ uuids, path, format, options }) => {
    const { outputPath, output, timedOutWithFile } = exportSelectionWithFallback(
      uuids,
      path,
      format,
      options
    );

    if (timedOutWithFile) {
      return {
        content: [
          {
            type: "text",
            text: `Selection export completed, but Illustrator response timed out.\n\n${JSON.stringify(
              {
                path: outputPath,
                requestedPath: path,
                format,
                selectionCount: uuids.length,
                warning:
                  "osascript response timed out after export. File existence was verified.",
              }
            )}`,
          },
        ],
      };
    }

    const resultText = output.trim()
      ? output
      : JSON.stringify({
          path: outputPath,
          requestedPath: path,
          format,
          options: options ?? {},
          selectionCount: uuids.length,
        });

    return {
      content: [{ type: "text", text: `Selection exported successfully.\n\n${resultText}` }],
    };
  }
);
