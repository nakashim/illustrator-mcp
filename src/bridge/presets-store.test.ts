import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

const loadStoreModule = async () => import("./presets-store");

describe("presets-store", () => {
  let tempDir = "";

  afterEach(() => {
    vi.resetModules();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
    delete process.env.ILLUSTRATOR_MCP_PRESETS_PATH;
  });

  it("persists presets to json and supports list/read/delete", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "illustrator-mcp-presets-"));
    process.env.ILLUSTRATOR_MCP_PRESETS_PATH = join(tempDir, "presets.json");

    const store = await loadStoreModule();
    store.upsertPreset({
      effect: "dither",
      name: "preset-a",
      params: { pixelSize: "2mm" },
      groupName: "dither_20260101_000000",
    });

    const names = store.listPresetNames("dither");
    expect(names).toEqual(["preset-a"]);

    const loaded = store.readPreset("dither", "preset-a");
    expect(loaded?.params).toEqual({ pixelSize: "2mm" });
    expect(loaded?.groupName).toBe("dither_20260101_000000");

    const removed = store.deletePreset("dither", "preset-a");
    expect(removed).toBe(true);
    expect(store.listPresetNames("dither")).toEqual([]);
  });

  it("prunes per-effect limit to 100 entries", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "illustrator-mcp-presets-"));
    process.env.ILLUSTRATOR_MCP_PRESETS_PATH = join(tempDir, "presets.json");

    const store = await loadStoreModule();
    for (let i = 0; i < 105; i += 1) {
      store.upsertPreset({
        effect: "dither",
        name: `p-${String(i).padStart(3, "0")}`,
        params: { i },
      });
    }

    const names = store.listPresetNames("dither");
    expect(names.length).toBe(100);

    const text = readFileSync(process.env.ILLUSTRATOR_MCP_PRESETS_PATH, "utf8");
    const parsed = JSON.parse(text) as { presets?: Record<string, unknown> };
    expect(Object.keys(parsed.presets ?? {}).length).toBe(100);
  });

  it("persists reordered names per effect", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "illustrator-mcp-presets-"));
    process.env.ILLUSTRATOR_MCP_PRESETS_PATH = join(tempDir, "presets.json");

    const store = await loadStoreModule();
    store.upsertPreset({ effect: "mosaic", name: "a", params: {} });
    store.upsertPreset({ effect: "mosaic", name: "b", params: {} });
    store.upsertPreset({ effect: "mosaic", name: "c", params: {} });

    const ordered = store.reorderPresetNames("mosaic", ["c", "a", "b"]);
    expect(ordered).toEqual(["c", "a", "b"]);
    expect(store.listPresetNames("mosaic")).toEqual(["c", "a", "b"]);
  });
});

