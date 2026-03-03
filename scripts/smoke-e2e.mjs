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
    rects: [{ position: ["10mm", "10mm"], size: ["30mm", "20mm"] }],
  });
  assertIncludes(rectText, "Created successfully.", "create_rects");

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
