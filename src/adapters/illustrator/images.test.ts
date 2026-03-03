import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../extend-utils/utils", () => ({
  executeExtendScript: vi.fn(() => "ok"),
}));

import { executeExtendScript } from "../../extend-utils/utils";
import { changeImages, listImages, placeImages } from "./images";

describe("images adapter scripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds place images script", () => {
    placeImages(["/tmp/a.png", "/tmp/b.png"]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('var paths = ["/tmp/a.png","/tmp/b.png"]');
    expect(script).toContain("doc.placedItems.add()");
  });

  it("builds list images script", () => {
    listImages();
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("doc.placedItems.length");
    expect(script).toContain("ptToMm");
  });

  it("builds change images script", () => {
    changeImages([
      {
        uuid: "u1",
        path: "/tmp/new.png",
        x: "10mm",
        y: "20mm",
        width: "30mm",
        height: "40mm",
        maintainAspectRatio: true,
      },
    ]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('"uuid":"u1"');
    expect(script).toContain('item.file = new File(inputs[i].path)');
    expect(script).toContain("maintainAspectRatio");
  });
});
