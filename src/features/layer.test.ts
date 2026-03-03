import { describe, expect, it } from "vitest";

import { buildLayerManageScript } from "./layer";

describe("buildLayerManageScript", () => {
  it("builds list action script", () => {
    const script = buildLayerManageScript("list");
    expect(script).toContain('var action = "list";');
    expect(script).toContain("serializeLayer");
  });

  it("embeds payload for create action", () => {
    const script = buildLayerManageScript("create", {
      name: "Brand",
      visible: true,
    });
    expect(script).toContain('"name":"Brand"');
    expect(script).toContain('"visible":true');
  });
});
