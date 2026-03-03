import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../extend-utils/utils", () => ({
  executeExtendScript: vi.fn(() => "ok"),
  toExtendScriptStringLiteral: (value: string) => JSON.stringify(value),
}));

import { executeExtendScript } from "../../extend-utils/utils";
import {
  changeCharacters,
  changeTextFrames,
  createTextFrames,
  listFonts,
  listTextFrames,
} from "./text";

describe("text adapter scripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds create textframes script", () => {
    createTextFrames(3);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("for (var i = 0; i < 3; i++)");
    expect(script).toContain("doc.textFrames.add()");
  });

  it("builds list textframes script", () => {
    listTextFrames();
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("doc.textFrames.length");
    expect(script).toContain("characterAttributes");
  });

  it("builds change textframes script", () => {
    changeTextFrames([
      {
        uuid: "t1",
        text: "hello",
        fontName: "ArialMT",
        fontSize: "12pt",
        colorCmyk: [0, 0, 0, 100],
      },
    ]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('"uuid":"t1"');
    expect(script).toContain("app.textFonts.getByName");
    expect(script).toContain("characterAttributes.fillColor");
  });

  it("builds change characters script", () => {
    changeCharacters("t1", [{ range: { from: 0, to: 3 }, fontSize: "10pt" }]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('var item = getPageItem("t1")');
    expect(script).toContain('"from":0');
    expect(script).toContain("charAttr.size = toPt");
  });

  it("builds list fonts script", () => {
    listFonts();
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("app.textFonts");
    expect(script).toContain("JSON.stringify(result)");
  });
});
