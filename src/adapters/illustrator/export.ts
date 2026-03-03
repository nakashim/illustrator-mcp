import fs from "fs";

import {
  classifyExecutionError,
  executeExtendScript,
} from "../../extend-utils/utils";

export type ExportFormat = "svg" | "pdf" | "png";

export type ExportOptions = {
  embedRasterImages?: boolean;
  precision?: number;
  compressed?: boolean;
  antiAliasing?: boolean;
  transparency?: boolean;
  artBoardClipping?: boolean;
  scalePercent?: number;
};

const buildExportOperationScript = () => `
if (format === "svg") {
  var svgOptions = new ExportOptionsSVG();
  svgOptions.embedRasterImages = options.embedRasterImages === true;
  if (options.precision !== undefined) {
    svgOptions.coordinatePrecision = options.precision;
  }
  if (options.compressed !== undefined) {
    svgOptions.compressed = options.compressed;
  }
  exportDoc.exportFile(targetFile, ExportType.SVG, svgOptions);
} else if (format === "pdf") {
  var pdfOptions = new PDFSaveOptions();
  exportDoc.saveAs(targetFile, pdfOptions);
} else if (format === "png") {
  var pngOptions = new ExportOptionsPNG24();
  pngOptions.antiAliasing = options.antiAliasing !== false;
  pngOptions.transparency = options.transparency !== false;
  pngOptions.artBoardClipping = options.artBoardClipping !== false;
  if (options.scalePercent !== undefined) {
    pngOptions.horizontalScale = options.scalePercent;
    pngOptions.verticalScale = options.scalePercent;
  }
  exportDoc.exportFile(targetFile, ExportType.PNG24, pngOptions);
}
`;

export const buildExportArtifactScript = (
  path: string,
  format: ExportFormat,
  options?: ExportOptions
) => `
var exportDoc = getDocument();
var exportPath = ${JSON.stringify(path)};
var format = ${JSON.stringify(format)};
var options = ${JSON.stringify(options ?? {})};
var targetFile = new File(exportPath);

if (!exportPath) {
  throw new Error("path is required");
}

${buildExportOperationScript()}

JSON.stringify({
  path: exportPath,
  format: format,
  options: options,
});
`;

export const buildExportSelectionScript = (
  uuids: string[],
  path: string,
  format: ExportFormat,
  options?: ExportOptions
) => `
var sourceDoc = getDocument();
var exportDoc = null;
var uuids = ${JSON.stringify(uuids)};
var exportPath = ${JSON.stringify(path)};
var format = ${JSON.stringify(format)};
var options = ${JSON.stringify(options ?? {})};
var targetFile = new File(exportPath);

if (!exportPath) {
  throw new Error("path is required");
}
if (!uuids || uuids.length === 0) {
  throw new Error("uuids is required");
}

var sourceLeft = 0;
var sourceTop = 0;
var sourceRight = 0;
var sourceBottom = 0;
var exportLeft = 0;
var exportTop = 0;
var exportRight = 0;
var exportBottom = 0;

for (var i = 0; i < uuids.length; i++) {
  var item = getPageItem(uuids[i]);
  if (!item) {
    throw new Error("PageItem not found");
  }
  var b = item.geometricBounds;
  if (i === 0) {
    sourceLeft = b[0];
    sourceTop = b[1];
    sourceRight = b[2];
    sourceBottom = b[3];
  } else {
    sourceLeft = Math.min(sourceLeft, b[0]);
    sourceTop = Math.max(sourceTop, b[1]);
    sourceRight = Math.max(sourceRight, b[2]);
    sourceBottom = Math.min(sourceBottom, b[3]);
  }
}

try {
  app.executeMenuCommand("deselectall");
  for (var j = 0; j < uuids.length; j++) {
    var selected = getPageItem(uuids[j]);
    if (selected) {
      selected.selected = true;
    }
  }
  app.executeMenuCommand("copy");

  exportDoc = app.documents.add();
  exportDoc.activate();
  app.executeMenuCommand("pasteInPlace");

  var pasted = exportDoc.selection;
  if (!pasted || pasted.length === 0) {
    throw new Error("No items were pasted into temporary document");
  }

  var left = 0;
  var top = 0;
  var right = 0;
  var bottom = 0;
  for (var k = 0; k < pasted.length; k++) {
    var pastedBounds = null;
    try {
      pastedBounds = pasted[k].visibleBounds;
    } catch (e) {
      pastedBounds = pasted[k].geometricBounds;
    }
    if (k === 0) {
      left = pastedBounds[0];
      top = pastedBounds[1];
      right = pastedBounds[2];
      bottom = pastedBounds[3];
    } else {
      left = Math.min(left, pastedBounds[0]);
      top = Math.max(top, pastedBounds[1]);
      right = Math.max(right, pastedBounds[2]);
      bottom = Math.min(bottom, pastedBounds[3]);
    }
  }

  var width = right - left;
  var height = top - bottom;
  var dx = -left;
  var dy = -top;
  for (var m = 0; m < pasted.length; m++) {
    try {
      pasted[m].translate(dx, dy);
    } catch (e) {
      pasted[m].left = pasted[m].left + dx;
      pasted[m].top = pasted[m].top + dy;
    }
  }

  exportDoc.artboards[0].artboardRect = [0, 0, width, -height];
  exportLeft = 0;
  exportTop = 0;
  exportRight = width;
  exportBottom = -height;

  ${buildExportOperationScript()}
} finally {
  if (exportDoc) {
    exportDoc.close(SaveOptions.DONOTSAVECHANGES);
  }
  sourceDoc.activate();
}

JSON.stringify({
  path: exportPath,
  format: format,
  options: options,
  selectionCount: uuids.length,
  bounds: {
    left: exportLeft,
    top: exportTop,
    right: exportRight,
    bottom: exportBottom
  },
  sourceBounds: {
    left: sourceLeft,
    top: sourceTop,
    right: sourceRight,
    bottom: sourceBottom
  }
});
`;

export const isExecutionTimeoutError = (error: unknown) =>
  classifyExecutionError(error).kind === "timeout";

export const normalizeExportPath = (
  requestedPath: string,
  format: ExportFormat,
  options?: ExportOptions
) => {
  if (format !== "svg") {
    return requestedPath;
  }

  const compressed = options?.compressed === true;
  if (!compressed) {
    return requestedPath;
  }

  if (requestedPath.endsWith(".svgz")) {
    return requestedPath;
  }

  if (requestedPath.endsWith(".svg")) {
    return `${requestedPath}z`;
  }

  return `${requestedPath}.svgz`;
};

export const exportArtifactWithFallback = (
  path: string,
  format: ExportFormat,
  options?: ExportOptions
) => {
  const outputPath = normalizeExportPath(path, format, options);
  try {
    const output = executeExtendScript(
      buildExportArtifactScript(outputPath, format, options)
    );
    return {
      outputPath,
      output,
      timedOutWithFile: false,
    };
  } catch (error) {
    if (isExecutionTimeoutError(error) && fs.existsSync(outputPath)) {
      return {
        outputPath,
        output: "",
        timedOutWithFile: true,
      };
    }
    throw error;
  }
};

export const exportSelectionWithFallback = (
  uuids: string[],
  path: string,
  format: ExportFormat,
  options?: ExportOptions
) => {
  const outputPath = normalizeExportPath(path, format, options);
  try {
    const output = executeExtendScript(
      buildExportSelectionScript(uuids, outputPath, format, options)
    );
    return {
      outputPath,
      output,
      timedOutWithFile: false,
    };
  } catch (error) {
    if (isExecutionTimeoutError(error) && fs.existsSync(outputPath)) {
      return {
        outputPath,
        output: "",
        timedOutWithFile: true,
      };
    }
    throw error;
  }
};
