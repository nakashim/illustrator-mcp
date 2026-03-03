import { describe, expect, it } from "vitest";

import { buildExportArtifactScript } from "./export";

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
});
