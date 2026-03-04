import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../extend-utils/utils", () => ({
  executeExtendScript: vi.fn(() => "ok"),
}));

import { executeExtendScript } from "../../extend-utils/utils";
import { drawHalftoneDots, drawMosaicTiles } from "./halftone";

describe("halftone adapter scripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds halftone dots script", () => {
    drawHalftoneDots([{ x: 10, y: 20, r: 2 }], [0, 0, 0, 100], "Halftone");
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("pathItems.ellipse");
    expect(script).toContain('group.name = "Halftone"');
  });

  it("builds mosaic tiles script", () => {
    drawMosaicTiles(
      [{ x: 10, y: 20, width: 5, height: 5, radius: 1, fillCmyk: [0, 0, 0, 50] }],
      "Mosaic",
      [0, 0, 0, 100],
      0.5
    );
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("roundedRectangle");
    expect(script).toContain('group.name = "Mosaic"');
    expect(script).toContain("tileCount");
  });
});
