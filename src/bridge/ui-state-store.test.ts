import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

const loadStateModule = async () => import("./ui-state-store");

describe("ui-state-store", () => {
  let tempDir = "";

  afterEach(() => {
    vi.resetModules();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
    delete process.env.ILLUSTRATOR_MCP_UI_STATE_PATH;
  });

  it("returns default state when file does not exist", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "illustrator-mcp-ui-state-"));
    process.env.ILLUSTRATOR_MCP_UI_STATE_PATH = join(tempDir, "ui-state.json");
    const store = await loadStateModule();
    const state = store.readUiState();
    expect(state.version).toBe(1);
    expect(typeof state.updatedAt).toBe("string");
  });

  it("deep-merges and persists patch updates", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "illustrator-mcp-ui-state-"));
    process.env.ILLUSTRATOR_MCP_UI_STATE_PATH = join(tempDir, "ui-state.json");
    const store = await loadStateModule();

    store.patchUiState({
      feature: { activeFeatureId: "image-to-vector" },
      imageToVector: { unit: "px", effect: "dither" },
    });
    const next = store.patchUiState({
      imageToVector: { exportFormat: "svg" },
    });

    expect(next.feature?.activeFeatureId).toBe("image-to-vector");
    expect(next.imageToVector?.unit).toBe("px");
    expect(next.imageToVector?.effect).toBe("dither");
    expect(next.imageToVector?.exportFormat).toBe("svg");
  });
});

