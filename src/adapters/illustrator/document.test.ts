import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../extend-utils/utils", () => ({
  executeExtendScript: vi.fn(() => "ok"),
  toExtendScriptStringLiteral: (value: string) => JSON.stringify(value),
}));

import { executeExtendScript } from "../../extend-utils/utils";
import {
  createDocument,
  duplicateArtboard,
  openDocument,
  saveDocument,
} from "./document";

describe("document adapter scripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds open document script", () => {
    openDocument("/tmp/sample.ai");
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('new File("/tmp/sample.ai")');
    expect(script).toContain("app.open");
  });

  it("builds create document script", () => {
    createDocument("100mm", "200mm");
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('toPt("100mm")');
    expect(script).toContain('toPt("200mm")');
    expect(script).toContain("artboardRect");
  });

  it("builds save document script with optional path", () => {
    saveDocument("/tmp/out.pdf");
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('var filePath = "/tmp/out.pdf"');
    expect(script).toContain("PDFSaveOptions");
  });

  it("builds duplicate artboard script", () => {
    duplicateArtboard(2);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("for (var i = 0; i < 2; i++)");
    expect(script).toContain("pasteInPlace");
  });
});
