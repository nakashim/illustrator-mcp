import { existsSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { server } from "../build/server.js";
import "../build/features/document.js";
import "../build/features/export.js";
import "../build/features/image.js";
import "../build/features/item.js";
import "../build/features/layer.js";
import "../build/features/path.js";
import "../build/features/text.js";
import "../build/features/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
process.env.ILLUSTRATOR_MCP_TMP_DIR = path.join(repoRoot, "illustrator-mcp-tmp");

const svgPath = process.env.SMOKE_SVG_PATH ?? path.join(repoRoot, "tmp-smoke.svg");
const svgzPath =
  process.env.SMOKE_SVGZ_PATH ?? path.join(repoRoot, "tmp-smoke-compressed.svgz");

const cleanup = () => {
  if (existsSync(svgPath)) {
    rmSync(svgPath);
  }
  if (existsSync(svgzPath)) {
    rmSync(svgzPath);
  }
};

const readText = (result) => result.content?.[0]?.text ?? "";
const readPayload = (text) => {
  const idx = text.indexOf("\n\n");
  if (idx < 0) {
    return null;
  }
  const body = text.slice(idx + 2).trim();
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const callTool = async (client, name, args) => {
  const result = await client.callTool({ name, arguments: args });
  const text = readText(result);
  console.log(`\n[${name}]`);
  console.log(text);
  return text;
};

const assertIncludes = (text, keyword, label) => {
  if (!text.includes(keyword)) {
    throw new Error(`${label} did not include expected text: ${keyword}`);
  }
};

const main = async () => {
  cleanup();

  const client = new Client({
    name: "smoke-e2e",
    version: "0.1.0",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const healthText = await callTool(client, "health_check", {
    includeCapabilities: true,
  });
  assertIncludes(healthText, "appVersion", "health_check");
  assertIncludes(healthText, "capabilities", "health_check");

  const docText = await callTool(client, "create_document", {
    width: "120mm",
    height: "120mm",
  });
  assertIncludes(docText, "Document created.", "create_document");

  const layerCreateText = await callTool(client, "layer_manage", {
    action: "create",
    payload: {
      name: "SmokeLayer",
      visible: true,
      locked: false,
    },
  });
  assertIncludes(layerCreateText, "Layer operation completed.", "layer_manage(create)");
  assertIncludes(layerCreateText, "SmokeLayer", "layer_manage(create)");

  const layerListText = await callTool(client, "layer_manage", {
    action: "list",
  });
  assertIncludes(layerListText, "SmokeLayer", "layer_manage(list)");

  const rectText = await callTool(client, "create_rects", {
    rects: [
      { position: ["10mm", "10mm"], size: ["30mm", "20mm"] },
      { position: ["50mm", "10mm"], size: ["20mm", "20mm"] },
    ],
  });
  assertIncludes(rectText, "Created successfully.", "create_rects");
  const rectPayload = readPayload(rectText);
  if (!Array.isArray(rectPayload) || rectPayload.length < 2) {
    throw new Error("create_rects did not return expected UUID payload");
  }

  const lineText = await callTool(client, "create_lines", {
    lines: [{ points: { from: ["10mm", "40mm"], to: ["90mm", "40mm"] } }],
  });
  assertIncludes(lineText, "Successfully created.", "create_lines");

  const pathListText = await callTool(client, "list_pathitems", {});
  assertIncludes(pathListText, "Retrieved successfully.", "list_pathitems");

  const selectText = await callTool(client, "select_items", {
    uuids: [rectPayload[0].uuid],
  });
  assertIncludes(selectText, "Objects selected.", "select_items");

  const removeText = await callTool(client, "remove_items", {
    uuids: [rectPayload[1].uuid],
  });
  assertIncludes(removeText, "Objects removed.", "remove_items");

  const textFrameText = await callTool(client, "create_textframes", { count: 1 });
  assertIncludes(textFrameText, "Placed successfully.", "create_textframes");

  const textListText = await callTool(client, "list_textframes", {});
  assertIncludes(textListText, "Retrieved successfully.", "list_textframes");

  const fontsText = await callTool(client, "list_fonts", {});
  assertIncludes(fontsText, "Retrieved successfully.", "list_fonts");

  const svgText = await callTool(client, "export_artifact", {
    path: svgPath,
    format: "svg",
    options: {
      precision: 4,
      compressed: false,
      embedRasterImages: false,
    },
  });
  assertIncludes(svgText, "Exported successfully.", "export_artifact(svg)");
  if (!existsSync(svgPath)) {
    throw new Error(`SVG output was not created at ${svgPath}`);
  }

  const svgzText = await callTool(client, "export_artifact", {
    path: svgzPath,
    format: "svg",
    options: {
      precision: 4,
      compressed: true,
      embedRasterImages: false,
    },
  });
  assertIncludes(svgzText, "Exported successfully.", "export_artifact(svgz)");
  if (!existsSync(svgzPath)) {
    throw new Error(`SVGZ output was not created at ${svgzPath}`);
  }

  console.log("\nSmoke E2E completed successfully.");
};

main().catch((error) => {
  console.error("\nSmoke E2E failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
