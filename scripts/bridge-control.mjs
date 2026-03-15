import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const mode = process.argv[2] ?? "run";
const port = Number(process.env.ILLUSTRATOR_BRIDGE_PORT ?? "43123");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const getListeningPid = () => {
  try {
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" }
    ).trim();
    if (!out) {
      return null;
    }
    const first = out.split("\n")[0]?.trim();
    return first ? Number(first) : null;
  } catch {
    return null;
  }
};

const getProcessCommand = (pid) => {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
};

const isOwnBridgeProcess = (command) => {
  if (!command) {
    return false;
  }
  const markers = [
    "build/bridge/index.js",
    "src/bridge/index.ts",
    "/bridge/index.js",
    "/bridge/index.ts",
  ];
  return markers.some((marker) => command.includes(marker));
};

const waitPortRelease = async (maxRetry = 30) => {
  for (let i = 0; i < maxRetry; i += 1) {
    if (!getListeningPid()) {
      return true;
    }
    await sleep(200);
  }
  return false;
};

const startBridge = () => {
  const child = spawn("node", ["build/bridge/index.js"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
};

const main = async () => {
  const existingPid = getListeningPid();
  if (!existingPid) {
    startBridge();
    return;
  }

  const existingCommand = getProcessCommand(existingPid);
  if (!isOwnBridgeProcess(existingCommand)) {
    console.error(
      `Port ${port} is already used by another process (pid=${existingPid}). ` +
        "Will not terminate it automatically."
    );
    process.exit(1);
  }

  if (mode === "run") {
    console.log(
      `Bridge already running (pid=${existingPid}) on port ${port}. Reusing existing process.`
    );
    process.exit(0);
  }

  if (mode !== "restart") {
    console.error(`Unknown mode: ${mode}. Use 'run' or 'restart'.`);
    process.exit(1);
  }

  try {
    process.kill(existingPid, "SIGTERM");
  } catch (error) {
    console.error(`Failed to terminate existing bridge pid=${existingPid}: ${String(error)}`);
    process.exit(1);
  }

  const released = await waitPortRelease();
  if (!released) {
    console.error(`Bridge port ${port} did not release in time after SIGTERM.`);
    process.exit(1);
  }

  startBridge();
};

void main();
