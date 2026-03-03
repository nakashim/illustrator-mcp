import z from "zod";

import { executeExtendScript } from "../extend-utils/utils";
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

export const buildExportArtifactScript = (
  path: string,
  format: z.infer<typeof exportFormatSchema>,
  options?: z.infer<typeof exportOptionsSchema>
) => `
var doc = getDocument();
var exportPath = ${JSON.stringify(path)};
var format = ${JSON.stringify(format)};
var options = ${JSON.stringify(options ?? {})};
var targetFile = new File(exportPath);

if (!exportPath) {
  throw new Error("path is required");
}

if (format === "svg") {
  var svgOptions = new ExportOptionsSVG();
  svgOptions.embedRasterImages = options.embedRasterImages === true;
  if (options.precision !== undefined) {
    svgOptions.coordinatePrecision = options.precision;
  }
  if (options.compressed !== undefined) {
    svgOptions.compressed = options.compressed;
  }
  doc.exportFile(targetFile, ExportType.SVG, svgOptions);
} else if (format === "pdf") {
  var pdfOptions = new PDFSaveOptions();
  doc.saveAs(targetFile, pdfOptions);
} else if (format === "png") {
  var pngOptions = new ExportOptionsPNG24();
  pngOptions.antiAliasing = options.antiAliasing !== false;
  pngOptions.transparency = options.transparency !== false;
  pngOptions.artBoardClipping = options.artBoardClipping !== false;
  if (options.scalePercent !== undefined) {
    pngOptions.horizontalScale = options.scalePercent;
    pngOptions.verticalScale = options.scalePercent;
  }
  doc.exportFile(targetFile, ExportType.PNG24, pngOptions);
}

JSON.stringify({
  path: exportPath,
  format: format,
  options: options,
});
`;

server.tool(
  "export_artifact",
  "Export the document to SVG, PDF, or PNG.",
  {
    path: z.string().describe("Absolute output path"),
    format: exportFormatSchema.describe("Export format"),
    options: exportOptionsSchema.describe("Optional export settings"),
  },
  async ({ path, format, options }) => {
    const output = executeExtendScript(
      buildExportArtifactScript(path, format, options)
    );
    return {
      content: [{ type: "text", text: `Exported successfully.\n\n${output}` }],
    };
  }
);
