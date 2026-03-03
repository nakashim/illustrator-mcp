import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../extend-utils/utils", () => ({
  executeExtendScript: vi.fn(() => "ok"),
}));

import { executeExtendScript } from "../../extend-utils/utils";
import { groupItems, maskItems, removeItems, selectItems } from "./item";

describe("item adapter scripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds select items script", () => {
    selectItems(["a", "b"]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('var uuids = ["a","b"]');
    expect(script).toContain("item.selected = true");
  });

  it("builds group items script", () => {
    groupItems(["a", "b"]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("doc.groupItems.add()");
    expect(script).toContain("item.moveToBeginning(group)");
  });

  it("builds remove items script", () => {
    removeItems(["a", "b"]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain("item.remove()");
    expect(script).toContain("doc.pageItems.length");
  });

  it("builds mask items script", () => {
    maskItems([{ maskUuid: "mask", maskedUuids: ["a", "b"] }]);
    const script = vi.mocked(executeExtendScript).mock.calls[0][0] as string;
    expect(script).toContain('"maskUuid":"mask"');
    expect(script).toContain("group.clipped = true");
  });
});
