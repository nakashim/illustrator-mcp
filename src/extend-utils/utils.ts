import { execFileSync } from "child_process";
import fs, { mkdirSync } from "fs";
import os from "os";
import path from "path";

import { jsonDefinition } from "./json";

const DEFAULT_OSASCRIPT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRY_COUNT = 1;

type ExecuteExtendScriptOptions = {
  timeoutMs?: number;
  retries?: number;
};

export type ExecutionErrorKind =
  | "timeout"
  | "connection_invalid"
  | "no_such_object"
  | "permission_denied"
  | "script_syntax_error"
  | "unknown";

type ExecutionErrorInfo = {
  kind: ExecutionErrorKind;
  message: string;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === "string") {
    return error;
  }
  if (typeof error !== "object" || error === null) {
    return "";
  }

  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const stderr =
    "stderr" in error && (error as { stderr?: unknown }).stderr
      ? String((error as { stderr?: unknown }).stderr)
      : "";
  return `${message}\n${stderr}`.trim();
};

export const classifyExecutionError = (error: unknown): ExecutionErrorInfo => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message = getErrorMessage(error);

  if (code === "ETIMEDOUT" || message.includes("ETIMEDOUT")) {
    return { kind: "timeout", message };
  }
  if (message.includes("Connection invalid") || message.includes("(-609)")) {
    return { kind: "connection_invalid", message };
  }
  if (message.includes("kAENoSuchObject")) {
    return { kind: "no_such_object", message };
  }
  if (
    message.includes("Not authorized to send Apple events") ||
    message.includes("Operation not permitted")
  ) {
    return { kind: "permission_denied", message };
  }
  if (message.includes("Expected end of line but found identifier")) {
    return { kind: "script_syntax_error", message };
  }
  return { kind: "unknown", message };
};

export const shouldRetryExecutionError = (error: unknown) => {
  const info = classifyExecutionError(error);
  return info.kind === "connection_invalid" || info.kind === "no_such_object";
};

export const toExtendScriptStringLiteral = (value: string) =>
  JSON.stringify(value);

export const executeExtendScript = (
  script: string,
  options?: ExecuteExtendScriptOptions
) => {
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
  const appleScriptPathLiteral = extendScriptPath
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  const appleScript = `tell application "Adobe Illustrator"
    set resultText to do javascript of file "${appleScriptPathLiteral}"
end tell
return resultText`;
  const appleScriptPath = path.join(dir, `message-${requestId}.scpt`);
  fs.writeFileSync(appleScriptPath, appleScript);

  const timeoutMs = options?.timeoutMs ?? DEFAULT_OSASCRIPT_TIMEOUT_MS;
  const retries = options?.retries ?? DEFAULT_RETRY_COUNT;

  try {
    let attempt = 0;
    while (true) {
      try {
        // 実行
        const output = execFileSync("osascript", [appleScriptPath], {
          timeout: timeoutMs,
        });
        return output.toString();
      } catch (error) {
        const canRetry = attempt < retries && shouldRetryExecutionError(error);
        if (!canRetry) {
          throw error;
        }
        attempt += 1;
      }
    }
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
