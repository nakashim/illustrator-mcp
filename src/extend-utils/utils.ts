import { execFileSync } from "child_process";
import fs, { mkdirSync } from "fs";
import os from "os";
import path from "path";

import { jsonDefinition } from "./json";

const DEFAULT_OSASCRIPT_TIMEOUT_MS = 120_000;

export const executeExtendScript = (script: string) => {
  // 一時フォルダ生成
  const dir =
    process.env.ILLUSTRATOR_MCP_TMP_DIR ?? `${os.homedir()}/illustrator-mcp-tmp`;
  if (!fs.existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const scriptDefinitions = [
    createUUIDDefinition,
    getDocumentDefinition,
    getPageItemDefinition,
    jsonDefinition,
    ptToMmDefinition,
    toPtDefinition,
  ];

  const requestId = createRequestId();

  // ExtendScript 生成
  const extendScriptPath = path.join(dir, `message-${requestId}.jsx`);
  // 文字化け防止のために，BOM 付きで保存
  const combinedScript = `\ufeff
${scriptDefinitions.join("\n")}
${script}`;
  fs.writeFileSync(extendScriptPath, combinedScript);

  // AppleScript 生成
  const appleScript = `tell application "Adobe Illustrator"
    set resultText to do javascript of file "${extendScriptPath}"
end tell
return resultText`;
  const appleScriptPath = path.join(dir, `message-${requestId}.scpt`);
  fs.writeFileSync(appleScriptPath, appleScript);

  try {
    // 実行
    const output = execFileSync("osascript", [appleScriptPath], {
      timeout: DEFAULT_OSASCRIPT_TIMEOUT_MS,
    });
    return output.toString();
  } finally {
    cleanupTempFile(extendScriptPath);
    cleanupTempFile(appleScriptPath);
  }
};

const createRequestId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const cleanupTempFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  fs.unlinkSync(filePath);
};

const toPtDefinition = `
function mmToPt(mm) {
  return mm * (72 / 25.4);
}

function toPt(value) {
  if (value.indexOf("mm") !== -1) {
    var mm = parseFloat(value.replace("mm", ""));
    return mmToPt(mm);
  }
  if (value.indexOf("Q") !== -1) {
    var mm = parseFloat(value.replace("Q", "")) / 4;
    return mmToPt(mm);
  }
  return parseFloat(value);
}`;

const ptToMmDefinition = `
function ptToMm(pt) {
  return pt * (25.4 / 72) + "mm";
}`;

const getDocumentDefinition = `
function getDocument() {
  if (app.documents.length > 0) {
    return app.activeDocument;
  }
  return app.documents.add();
}`;

const getPageItemDefinition = `
function getPageItem(uuid) {
  var doc = getDocument();
  for (var i = 0; i < doc.pageItems.length; i++) {
    if (doc.pageItems[i].note === uuid) {
      return doc.pageItems[i];
    }
  }
  return null;
}`;

const createUUIDDefinition = `
function createUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    if (c === "x") {
      return r.toString(16);
    } else {
      return (r & 0x3 | 0x8).toString(16);
    }
  });
}`;
