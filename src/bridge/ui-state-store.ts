import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

export type UiState = {
  version: number;
  updatedAt: string;
  feature?: JsonRecord;
  imageToVector?: JsonRecord;
  ui?: JsonRecord;
};

const UI_STATE_FILE_PATH = process.env.ILLUSTRATOR_MCP_UI_STATE_PATH
  ? resolve(process.env.ILLUSTRATOR_MCP_UI_STATE_PATH)
  : resolve(__dirname, "../../panel/cep/storage/ui-state.json");

const nowIso = () => new Date().toISOString();

const isPlainObject = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeState = (value: unknown): UiState => {
  if (!isPlainObject(value)) {
    return { version: 1, updatedAt: nowIso() };
  }
  return {
    version: Number.isFinite(Number(value.version)) ? Number(value.version) : 1,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
    feature: isPlainObject(value.feature) ? value.feature : undefined,
    imageToVector: isPlainObject(value.imageToVector) ? value.imageToVector : undefined,
    ui: isPlainObject(value.ui) ? value.ui : undefined,
  };
};

const deepMerge = (base: JsonRecord, patch: JsonRecord): JsonRecord => {
  const next: JsonRecord = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = next[key];
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      next[key] = deepMerge(baseValue, patchValue);
      continue;
    }
    next[key] = patchValue;
  }
  return next;
};

const readUiStateFromDisk = (): UiState => {
  try {
    const raw = readFileSync(UI_STATE_FILE_PATH, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    return { version: 1, updatedAt: nowIso() };
  }
};

const writeUiStateToDisk = (state: UiState) => {
  mkdirSync(dirname(UI_STATE_FILE_PATH), { recursive: true });
  const tmpPath = `${UI_STATE_FILE_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf8");
  renameSync(tmpPath, UI_STATE_FILE_PATH);
};

export const readUiState = (): UiState => readUiStateFromDisk();

export const patchUiState = (patch: JsonRecord): UiState => {
  const current = readUiStateFromDisk();
  const merged = normalizeState(deepMerge(current as JsonRecord, patch));
  const next: UiState = {
    ...merged,
    version: 1,
    updatedAt: nowIso(),
  };
  writeUiStateToDisk(next);
  return next;
};

