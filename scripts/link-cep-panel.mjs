import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";

const EXTENSION_ID = "com.ncst.illustrator.mcp.panel";
const SOURCE_DIR = resolve(process.cwd(), "panel/cep");
const CEP_EXTENSIONS_DIR = join(
  homedir(),
  "Library/Application Support/Adobe/CEP/extensions"
);
const TARGET_LINK = join(CEP_EXTENSIONS_DIR, EXTENSION_ID);
const unlinkOnly = process.argv.includes("--unlink");

if (process.platform !== "darwin") {
  console.error("This script currently targets macOS CEP path only.");
  process.exit(1);
}

if (!existsSync(SOURCE_DIR)) {
  console.error(`Source panel directory not found: ${SOURCE_DIR}`);
  process.exit(1);
}

mkdirSync(CEP_EXTENSIONS_DIR, { recursive: true });

if (existsSync(TARGET_LINK)) {
  const stat = lstatSync(TARGET_LINK);
  if (stat.isSymbolicLink() || stat.isDirectory() || stat.isFile()) {
    rmSync(TARGET_LINK, { recursive: true, force: true });
  }
}

if (unlinkOnly) {
  console.log(`Unlinked CEP panel: ${TARGET_LINK}`);
  process.exit(0);
}

symlinkSync(SOURCE_DIR, TARGET_LINK, "dir");
console.log(`Linked CEP panel:\n${TARGET_LINK} -> ${SOURCE_DIR}`);
console.log(
  "If panel is not visible in Illustrator, enable CEP debug mode and restart Illustrator."
);
