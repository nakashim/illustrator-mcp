import { describe, expect, it } from "vitest";

import {
  buildExportArtifactScript,
  buildExportSelectionScript,
  normalizeExportPath,
  isExecutionTimeoutError,
} from "../adapters/illustrator";

describe("buildExportArtifactScript", () => {
  it("builds svg export script", () => {
    const script = buildExportArtifactScript("/tmp/test.svg", "svg", {
      precision: 4,
      embedRasterImages: false,
      compressed: true,
    });
    expect(script).toContain('var format = "svg";');
    expect(script).toContain("ExportOptionsSVG");
    expect(script).toContain('"precision":4');
  });

  it("builds png export script with scale", () => {
    const script = buildExportArtifactScript("/tmp/test.png", "png", {
      scalePercent: 200,
    });
    expect(script).toContain('var format = "png";');
    expect(script).toContain("ExportOptionsPNG24");
    expect(script).toContain('"scalePercent":200');
  });

  it("builds selection export script with temporary document flow", () => {
    const script = buildExportSelectionScript(
      ["u1", "u2"],
      "/tmp/selection.svg",
      "svg",
      { compressed: false, precision: 4 }
    );
    expect(script).toContain('var uuids = ["u1","u2"]');
    expect(script).toContain("exportDoc = app.documents.add()");
    expect(script).toContain("exportDoc.close(SaveOptions.DONOTSAVECHANGES)");
    expect(script).toContain("selectionCount");
  });

  it("detects timeout error shape", () => {
    expect(isExecutionTimeoutError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isExecutionTimeoutError({ code: "ENOENT" })).toBe(false);
    expect(isExecutionTimeoutError(null)).toBe(false);
  });

  it("normalizes svg path to svgz when compressed is true", () => {
    expect(
      normalizeExportPath("/tmp/out.svg", "svg", { compressed: true })
    ).toBe("/tmp/out.svgz");
    expect(
      normalizeExportPath("/tmp/out", "svg", { compressed: true })
    ).toBe("/tmp/out.svgz");
  });

  it("keeps requested path when not compressed or non-svg", () => {
    expect(
      normalizeExportPath("/tmp/out.svg", "svg", { compressed: false })
    ).toBe("/tmp/out.svg");
    expect(
      normalizeExportPath("/tmp/out.pdf", "pdf", { compressed: true })
    ).toBe("/tmp/out.pdf");
  });
});
