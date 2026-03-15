import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { EffectType } from "./effects";

export type PresetEntry = {
  params: Record<string, unknown>;
  groupName?: string;
  savedAt: string;
};

export const PRESET_LIMITS = {
  maxPerEffect: 100,
  maxTotal: 1200,
};

const PRESET_FILE_PATH = process.env.ILLUSTRATOR_MCP_PRESETS_PATH
  ? resolve(process.env.ILLUSTRATOR_MCP_PRESETS_PATH)
  : resolve(process.cwd(), "panel/cep/storage/presets.json");

type PresetStore = Record<string, PresetEntry>;
type PresetOrderStore = Partial<Record<EffectType, string[]>>;
type PresetStoreFile = {
  presets: PresetStore;
  order: PresetOrderStore;
};

const nowIso = () => new Date().toISOString();
const toEpochMs = (value: unknown) => {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? t : 0;
};

const createPresetKey = (effect: EffectType, name: string) => `${effect}::${name}`;
const getEffectFromPresetKey = (key: string) => String(key).split("::")[0] ?? "";
const getNameFromPresetKey = (key: string) => String(key).split("::").slice(1).join("::");
const sortBySavedAtDesc = (a: [string, PresetEntry], b: [string, PresetEntry]) =>
  toEpochMs(b[1]?.savedAt) - toEpochMs(a[1]?.savedAt);

const toValidPresetEntry = (value: unknown): PresetEntry | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const params =
    source.params && typeof source.params === "object"
      ? (source.params as Record<string, unknown>)
      : {};
  const savedAtRaw = source.savedAt;
  const savedAtParsed = Date.parse(String(savedAtRaw ?? ""));
  return {
    params,
    groupName: typeof source.groupName === "string" ? source.groupName : undefined,
    savedAt: Number.isFinite(savedAtParsed) ? new Date(savedAtParsed).toISOString() : nowIso(),
  };
};

const toValidPresetOrderStore = (value: unknown): PresetOrderStore => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: PresetOrderStore = {};
  for (const effect of ["dither", "mosaic", "halftone"] as const) {
    const list = source[effect];
    if (!Array.isArray(list)) continue;
    const normalized = Array.from(
      new Set(
        list
          .map((name) => String(name ?? "").trim())
          .filter((name) => name.length > 0)
      )
    );
    if (normalized.length > 0) {
      out[effect] = normalized;
    }
  }
  return out;
};

const normalizePresetOrder = (effect: EffectType, names: string[], currentNames: string[]) => {
  const currentSet = new Set(currentNames);
  const requested = [];
  const seen = new Set<string>();
  for (const nameRaw of names) {
    const name = String(nameRaw ?? "").trim();
    if (!name || seen.has(name) || !currentSet.has(name)) continue;
    requested.push(name);
    seen.add(name);
  }
  for (const name of currentNames) {
    if (seen.has(name)) continue;
    requested.push(name);
  }
  return requested;
};

const prunePresetStore = (store: PresetStore, limits = PRESET_LIMITS): PresetStore => {
  const entries = Object.entries(store).filter(([, value]) => value && typeof value === "object");
  const byEffect = new Map<string, Array<[string, PresetEntry]>>();

  for (const [key, value] of entries) {
    const effect = getEffectFromPresetKey(key);
    if (!byEffect.has(effect)) byEffect.set(effect, []);
    byEffect.get(effect)?.push([key, value]);
  }

  const keptPerEffect: Array<[string, PresetEntry]> = [];
  for (const effectEntries of byEffect.values()) {
    effectEntries.sort(sortBySavedAtDesc);
    keptPerEffect.push(...effectEntries.slice(0, Math.max(1, limits.maxPerEffect)));
  }

  keptPerEffect.sort(sortBySavedAtDesc);
  const kept = keptPerEffect.slice(0, Math.max(1, limits.maxTotal));
  return Object.fromEntries(kept);
};

const applyOrder = (effect: EffectType, names: string[], order: PresetOrderStore): string[] => {
  const preferred = Array.isArray(order[effect]) ? (order[effect] as string[]) : [];
  if (preferred.length === 0) return names.sort((a, b) => a.localeCompare(b));
  const normalized = normalizePresetOrder(effect, preferred, names);
  return normalized;
};

const cleanupOrder = (store: PresetStore, order: PresetOrderStore): PresetOrderStore => {
  const result: PresetOrderStore = {};
  for (const effect of ["dither", "mosaic", "halftone"] as const) {
    const names = Object.keys(store)
      .filter((key) => key.startsWith(`${effect}::`))
      .map((key) => getNameFromPresetKey(key));
    if (names.length === 0) continue;
    result[effect] = applyOrder(effect, names, order);
  }
  return result;
};

const pruneStoreFile = (file: PresetStoreFile, limits = PRESET_LIMITS): PresetStoreFile => {
  const presets = prunePresetStore(file.presets, limits);
  const order = cleanupOrder(presets, file.order);
  return { presets, order };
};

const readStoreFromDisk = (): PresetStoreFile => {
  try {
    const raw = readFileSync(PRESET_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { presets: {}, order: {} };
    }

    const parsedObj = parsed as Record<string, unknown>;
    const rawPresets =
      parsedObj.presets && typeof parsedObj.presets === "object" && !Array.isArray(parsedObj.presets)
        ? (parsedObj.presets as Record<string, unknown>)
        : {};
    const rawOrder = parsedObj.order;

    const normalizedPresets: PresetStore = {};
    for (const [key, value] of Object.entries(rawPresets)) {
      const entry = toValidPresetEntry(value);
      if (!entry) continue;
      normalizedPresets[key] = entry;
    }
    const normalizedOrder = toValidPresetOrderStore(rawOrder);
    return pruneStoreFile({ presets: normalizedPresets, order: normalizedOrder });
  } catch {
    return { presets: {}, order: {} };
  }
};

const writeStoreToDisk = (file: PresetStoreFile) => {
  const sanitized = pruneStoreFile(file);
  const dir = dirname(PRESET_FILE_PATH);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${PRESET_FILE_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(sanitized, null, 2), "utf8");
  renameSync(tmpPath, PRESET_FILE_PATH);
};

export const listPresetNames = (effect: EffectType): string[] => {
  const store = readStoreFromDisk();
  const names = Object.keys(store.presets)
    .filter((key) => key.startsWith(`${effect}::`))
    .map((key) => getNameFromPresetKey(key));
  return applyOrder(effect, names, store.order);
};

export const readPreset = (effect: EffectType, name: string): PresetEntry | null => {
  const store = readStoreFromDisk();
  return store.presets[createPresetKey(effect, name)] ?? null;
};

export const upsertPreset = (input: {
  effect: EffectType;
  name: string;
  params: Record<string, unknown>;
  groupName?: string;
}): PresetEntry => {
  const store = readStoreFromDisk();
  const key = createPresetKey(input.effect, input.name);
  const existed = key in store.presets;
  const entry: PresetEntry = {
    params: input.params && typeof input.params === "object" ? input.params : {},
    groupName: typeof input.groupName === "string" ? input.groupName : undefined,
    savedAt: nowIso(),
  };
  const nextPresets = {
    ...store.presets,
    [key]: entry,
  };
  const nextOrder: PresetOrderStore = {
    ...store.order,
  };
  const currentNames = listPresetNames(input.effect);
  if (!existed) {
    nextOrder[input.effect] = [...currentNames, input.name];
  }
  writeStoreToDisk({
    presets: nextPresets,
    order: nextOrder,
  });
  return entry;
};

export const deletePreset = (effect: EffectType, name: string): boolean => {
  const store = readStoreFromDisk();
  const key = createPresetKey(effect, name);
  if (!(key in store.presets)) return false;
  const nextPresets = { ...store.presets };
  delete nextPresets[key];
  const nextOrder: PresetOrderStore = {
    ...store.order,
    [effect]: (store.order[effect] ?? []).filter((item) => item !== name),
  };
  writeStoreToDisk({ presets: nextPresets, order: nextOrder });
  return true;
};

export const reorderPresetNames = (effect: EffectType, names: string[]): string[] => {
  const store = readStoreFromDisk();
  const currentNames = Object.keys(store.presets)
    .filter((key) => key.startsWith(`${effect}::`))
    .map((key) => getNameFromPresetKey(key));
  const nextOrder = normalizePresetOrder(effect, names, currentNames);
  writeStoreToDisk({
    presets: store.presets,
    order: {
      ...store.order,
      [effect]: nextOrder,
    },
  });
  return nextOrder;
};

