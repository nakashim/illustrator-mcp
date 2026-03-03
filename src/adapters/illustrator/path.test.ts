import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../extend-utils/utils", () => ({
  executeExtendScript: vi.fn(() => "ok"),
}));

import { executeExtendScript } from "../../extend-utils/utils";
import { changePathItems, createLines, createRects, listPathItems } from "./path";

describe("path adapter scripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds create rects script", () => {
    createRects([{ position: ["10mm", "20mm"], size: ["30mm", "40mm"] }]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("doc.pathItems.rectangle");
    expect(script).toContain('"position":["10mm","20mm"]');
  });

  it("builds create lines script", () => {
    createLines([{ points: { from: ["1mm", "2mm"], to: ["3mm", "4mm"] } }]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("line.setEntirePath");
    expect(script).toContain('"from":["1mm","2mm"]');
  });

  it("builds list path items script", () => {
    listPathItems();
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("doc.pathItems.length");
    expect(script).toContain("item.note");
  });

  it("builds change path items script", () => {
    changePathItems([
      {
        uuid: "p1",
        fillCmyk: ["0", "0", "0", "100"],
        strokeWidth: "1mm",
        position: ["10mm", "20mm"],
      },
    ]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('"uuid":"p1"');
    expect(script).toContain("item.strokeWidth = toPt");
    expect(script).toContain("item.position = [x, y]");
  });
});
