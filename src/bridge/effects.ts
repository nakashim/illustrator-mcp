import z from "zod";

import { generateDitherTiles } from "../core/dither";
import { generateHalftoneDots, parseLengthToPt } from "../core/halftone";
import type { HalftoneOptions } from "../core/halftone";
import { generateMosaicTiles } from "../core/mosaic";
import { drawHalftoneDots, drawMosaicTiles, getPlacedImageInfo, listImages } from "../adapters/illustrator";
import {
  exportSelectionWithFallback,
  type ExportFormat,
  type ExportOptions,
} from "../adapters/illustrator/export";
import {
  createCellAverageRgbaSampler,
  createCellAverageSampler,
  readImageBitmap,
  readImageSize,
} from "../adapters/image";
import { executeExtendScript } from "../extend-utils/utils";

export const effectTypeSchema = z.enum(["halftone", "mosaic", "dither"]);
export type EffectType = z.infer<typeof effectTypeSchema>;
export type EffectRisk = "low" | "medium" | "high";

const runEffectRequestSchema = z.object({
  effect: effectTypeSchema,
  targetUuid: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  preview: z.boolean().optional(),
});

export type RunEffectRequest = z.infer<typeof runEffectRequestSchema>;

const estimateRequestSchema = z.object({
  effect: effectTypeSchema,
  targetUuid: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export type EstimateRequest = z.infer<typeof estimateRequestSchema>;

const exportSelectionRequestSchema = z.object({
  uuids: z.array(z.string().min(1)).min(1),
  path: z.string().min(1),
  format: z.enum(["svg", "pdf", "png"]),
  options: z
    .object({
      embedRasterImages: z.boolean().optional(),
      precision: z.number().min(1).max(7).optional(),
      compressed: z.boolean().optional(),
      antiAliasing: z.boolean().optional(),
      transparency: z.boolean().optional(),
      artBoardClipping: z.boolean().optional(),
      scalePercent: z.number().min(1).max(1000).optional(),
    })
    .optional(),
});

export type ExportSelectionRequest = z.infer<typeof exportSelectionRequestSchema>;

const reorderPresetsRequestSchema = z.object({
  effect: effectTypeSchema,
  names: z.array(z.string()),
});

export type ReorderPresetsRequest = z.infer<typeof reorderPresetsRequestSchema>;

const ditherPatternSchema = z.enum([
  "bayer2",
  "bayer4",
  "bayer8",
  "blue-noise",
  "clustered_4x4",
  "floyd-steinberg",
  "atkinson",
  "riemersma",
  "random",
]);

const ditherParamsSchema = z.object({
  pixelSize: z.string().optional(),
  pattern: ditherPatternSchema.optional(),
  threshold: z.number().min(0).max(1).optional(),
  invert: z.boolean().optional(),
  maxTiles: z.number().int().min(100).max(100000).optional(),
  backgroundThreshold: z.number().min(0).max(1).optional(),
  colorMode: z.enum(["mono", "rgb"]).optional(),
  gamma: z.number().min(0.1).max(5).optional(),
  blackPoint: z.number().min(0).max(1).optional(),
  whitePoint: z.number().min(0).max(1).optional(),
  groupName: z.string().optional(),
});

const mosaicParamsSchema = z.object({
  tileSize: z.string().optional(),
  gap: z.string().optional(),
  cornerRadius: z.string().optional(),
  maxTiles: z.number().int().min(100).max(100000).optional(),
  backgroundThreshold: z.number().min(0).max(1).optional(),
  grayscale: z.boolean().optional(),
  strokeCmyk: z.array(z.number()).length(4).optional(),
  strokeWidth: z.string().optional(),
  groupName: z.string().optional(),
});

const halftoneParamsSchema = z.object({
  dotSpacing: z.string().optional(),
  minDotSize: z.string().optional(),
  maxDotSize: z.string().optional(),
  angleDeg: z.number().optional(),
  contrast: z.number().min(-100).max(100).optional(),
  gamma: z.number().min(0.1).max(5).optional(),
  dotScale: z.number().min(0).max(3).optional(),
  backgroundThreshold: z.number().min(0).max(1).optional(),
  invert: z.boolean().optional(),
  maxDots: z.number().int().min(100).max(100000).optional(),
  colorCmyk: z.array(z.number()).length(4).optional(),
  groupName: z.string().optional(),
});

export type BridgeRunResult = {
  groupUuid: string;
  groupName: string;
  count: number;
  raw: string;
  debug?: Record<string, unknown>;
};

export type BridgeEstimateResult = {
  effect: EffectType;
  estimatedShapes: number;
  risk: EffectRisk;
  hints: string[];
  safeParams: Record<string, unknown>;
};

export type BridgeSelectedTargetResult = {
  selectedUuid: string | null;
  selectedCount: number;
  candidates: Array<{
    uuid: string;
    path: string;
    selected: boolean;
  }>;
};

export type BridgeExportResult = {
  path: string;
  timedOutWithFile: boolean;
  output: string;
};

export type BridgeTargetImageSizeResult = {
  targetUuid: string;
  widthPx: number;
  heightPx: number;
};

export type BridgeTargetGeometryDebugResult = {
  targetUuid: string;
  widthPt: number;
  heightPt: number;
  boundsWidthPt: number;
  boundsHeightPt: number;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  formatted: {
    widthPt: string;
    heightPt: string;
    boundsWidthPt: string;
    boundsHeightPt: string;
  };
};

export type BridgeItemGeometryDebugResult = {
  uuid: string;
  typename: string;
  name: string;
  widthPt: number;
  heightPt: number;
  boundsWidthPt: number;
  boundsHeightPt: number;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  formatted: {
    widthPt: string;
    heightPt: string;
    boundsWidthPt: string;
    boundsHeightPt: string;
  };
};

export type BridgeSelectExportDirectoryResult = {
  selected: boolean;
  path: string | null;
};

const parseIllustratorResult = (
  rawResult: string,
  countKey: "dotCount" | "tileCount" | "primitiveCount"
): BridgeRunResult => {
  const parsed = JSON.parse(rawResult) as Record<string, unknown>;
  const groupUuid = String(parsed.groupUuid ?? "");
  const groupName = String(parsed.groupName ?? "");
  const count = Number(parsed[countKey] ?? 0);
  if (!groupUuid || !groupName || !Number.isFinite(count)) {
    throw new Error(`Invalid Illustrator response: ${rawResult}`);
  }
  return { groupUuid, groupName, count, raw: rawResult };
};

const withPreviewName = (groupName: string | undefined, fallback: string) => {
  const base = groupName ?? fallback;
  return `${base}_preview`;
};

const riskFromShapes = (estimatedShapes: number): EffectRisk => {
  if (estimatedShapes < 8000) {
    return "low";
  }
  if (estimatedShapes <= 25000) {
    return "medium";
  }
  return "high";
};

const countGridCells = (bounds: { left: number; right: number; top: number; bottom: number }, stepPt: number) => {
  const width = Math.max(0, bounds.right - bounds.left);
  const height = Math.max(0, bounds.top - bounds.bottom);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  const cols = Math.max(1, Math.floor(width / stepPt));
  const rows = Math.max(1, Math.floor(height / stepPt));
  return cols * rows;
};

type TimingMark = {
  stage: string;
  ms: number;
};

const nowMs = () => Number(process.hrtime.bigint()) / 1_000_000;
const shouldLogProfile = () => process.env.ILLUSTRATOR_BRIDGE_PROFILE === "1";
const nextTraceId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const timeSync = <T>(marks: TimingMark[], stage: string, fn: () => T): T => {
  const start = nowMs();
  try {
    return fn();
  } finally {
    marks.push({ stage, ms: Number((nowMs() - start).toFixed(2)) });
  }
};

const timeAsync = async <T>(marks: TimingMark[], stage: string, fn: () => Promise<T>): Promise<T> => {
  const start = nowMs();
  try {
    return await fn();
  } finally {
    marks.push({ stage, ms: Number((nowMs() - start).toFixed(2)) });
  }
};

const logProfile = (
  kind: "estimate" | "run",
  traceId: string,
  meta: Record<string, unknown>,
  marks: TimingMark[],
  startedAtMs: number,
  error?: unknown
) => {
  if (!shouldLogProfile()) return;
  const totalMs = Number((nowMs() - startedAtMs).toFixed(2));
  const message = {
    kind,
    traceId,
    totalMs,
    meta,
    marks,
    error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
  };
  console.info(`[bridge:profile] ${JSON.stringify(message)}`);
};

const estimateDither = (
  item: ReturnType<typeof getPlacedImageInfo>,
  params: z.infer<typeof ditherParamsSchema>
): BridgeEstimateResult => {
  const pixelSizePt = parseLengthToPt(params.pixelSize ?? "2mm");
  const gridCount = countGridCells(item.bounds, Math.max(0.2, pixelSizePt));
  const maxTiles = params.maxTiles ?? 40000;
  const estimatedShapes = Math.min(gridCount, maxTiles);
  const risk = riskFromShapes(estimatedShapes);
  const hints: string[] = [];
  if (risk !== "low") {
    hints.push("Increase pixelSize to reduce shape count.");
  }
  if ((params.pattern ?? "bayer4") === "riemersma" && risk === "high") {
    hints.push("Riemersma is sequential. Prefer larger pixelSize for stability.");
  }
  if ((params.pattern ?? "bayer4") === "blue-noise" && risk === "high") {
    hints.push("Blue-noise with smaller cells can be heavy on large images.");
  }
  return {
    effect: "dither",
    estimatedShapes,
    risk,
    hints,
    safeParams: {
      pixelSize: "4mm",
      maxTiles: Math.min(maxTiles, 8000),
    },
  };
};

const estimateMosaic = (
  item: ReturnType<typeof getPlacedImageInfo>,
  params: z.infer<typeof mosaicParamsSchema>
): BridgeEstimateResult => {
  const tileSizePt = parseLengthToPt(params.tileSize ?? "3mm");
  const step = Math.max(0.2, tileSizePt);
  const gridCount = countGridCells(item.bounds, step);
  const maxTiles = params.maxTiles ?? 20000;
  const estimatedShapes = Math.min(gridCount, maxTiles);
  const risk = riskFromShapes(estimatedShapes);
  const hints: string[] = [];
  if (risk !== "low") {
    hints.push("Increase tileSize or reduce maxTiles.");
  }
  if (params.strokeWidth && risk === "high") {
    hints.push("Tile strokes on many shapes can significantly slow Illustrator.");
  }
  return {
    effect: "mosaic",
    estimatedShapes,
    risk,
    hints,
    safeParams: {
      tileSize: "5mm",
      maxTiles: Math.min(maxTiles, 8000),
    },
  };
};

const estimateHalftone = (
  item: ReturnType<typeof getPlacedImageInfo>,
  params: z.infer<typeof halftoneParamsSchema>
): BridgeEstimateResult => {
  const spacingPt = parseLengthToPt(params.dotSpacing ?? "2mm");
  const gridCount = countGridCells(item.bounds, Math.max(0.2, spacingPt));
  const maxDots = params.maxDots ?? 2500;
  const estimatedShapes = Math.min(gridCount, maxDots);
  const risk = riskFromShapes(estimatedShapes);
  const hints: string[] = [];
  if (risk !== "low") {
    hints.push("Increase dotSpacing or reduce maxDots.");
  }
  if ((params.dotScale ?? 1) > 1.6 && risk !== "low") {
    hints.push("High dotScale may increase overlap and redraw cost.");
  }
  return {
    effect: "halftone",
    estimatedShapes,
    risk,
    hints,
    safeParams: {
      dotSpacing: "3mm",
      maxDots: Math.min(maxDots, 5000),
    },
  };
};

const runDither = async (
  targetUuid: string,
  paramsInput: z.infer<typeof ditherParamsSchema>,
  preview: boolean,
  traceId: string
) => {
  const startedAtMs = nowMs();
  const marks: TimingMark[] = [];
  const params = { ...paramsInput };
  try {
    if (preview) {
      params.pixelSize = params.pixelSize ?? "4mm";
      params.maxTiles = Math.min(params.maxTiles ?? 40000, 8000);
      params.groupName = withPreviewName(params.groupName, "DitherVector");
    }

    const item = timeSync(marks, "run.dither.getPlacedImageInfo", () => getPlacedImageInfo(targetUuid));
    if (!item.filePath) {
      throw new Error("Target item has no linked file path. Use a linked placed image for dithering.");
    }

    const image = await timeAsync(marks, "run.dither.readImageBitmap", () => readImageBitmap(item.filePath));
    const sampler = timeSync(marks, "run.dither.createSampler", () => createCellAverageRgbaSampler(image, 3));
    const pixelSizePtRaw = parseLengthToPt(params.pixelSize ?? "2mm");
    const pixelSizePt = Math.max(0.2, pixelSizePtRaw);
    const boundsWidthPt = item.bounds.right - item.bounds.left;
    const boundsHeightPt = item.bounds.top - item.bounds.bottom;
    const xCount = Math.max(1, Math.floor(boundsWidthPt / pixelSizePt));
    const yCount = Math.max(1, Math.floor(boundsHeightPt / pixelSizePt));
    const xRemainderPt = boundsWidthPt - xCount * pixelSizePt;
    const yRemainderPt = boundsHeightPt - yCount * pixelSizePt;
    const tiles = timeSync(marks, "run.dither.generateTiles", () =>
      generateDitherTiles(
        item.bounds,
        {
          pixelSizePt: pixelSizePtRaw,
          maxTiles: params.maxTiles ?? 40000,
          threshold: params.threshold ?? 0.5,
          invert: params.invert ?? false,
          pattern: params.pattern ?? "bayer4",
          backgroundThreshold: params.backgroundThreshold ?? 0.02,
          colorMode: params.colorMode ?? "mono",
          gamma: params.gamma ?? 1,
          blackPoint: params.blackPoint ?? 0,
          whitePoint: params.whitePoint ?? 1,
        },
        sampler
      )
    );
    const raw = timeSync(marks, "run.dither.drawMosaicTiles", () =>
      drawMosaicTiles(tiles, params.groupName ?? "DitherVector")
    );
    const result = timeSync(marks, "run.dither.parseIllustratorResult", () =>
      parseIllustratorResult(raw, "tileCount")
    );
    return {
      ...result,
      debug: {
        effect: "dither",
        preview,
        pixelSizeInput: params.pixelSize ?? null,
        pixelSizePtRaw,
        pixelSizePt,
        boundsWidthPt,
        boundsHeightPt,
        xCount,
        yCount,
        xRemainderPt,
        yRemainderPt,
      },
    };
  } finally {
    logProfile("run", traceId, { effect: "dither", preview, targetUuid }, marks, startedAtMs);
  }
};

const runMosaic = async (
  targetUuid: string,
  paramsInput: z.infer<typeof mosaicParamsSchema>,
  preview: boolean,
  traceId: string
) => {
  const startedAtMs = nowMs();
  const marks: TimingMark[] = [];
  const params = { ...paramsInput };
  try {
    if (preview) {
      params.tileSize = params.tileSize ?? "5mm";
      params.maxTiles = Math.min(params.maxTiles ?? 20000, 8000);
      params.groupName = withPreviewName(params.groupName, "MosaicTileVector");
    }

    const item = timeSync(marks, "run.mosaic.getPlacedImageInfo", () => getPlacedImageInfo(targetUuid));
    if (!item.filePath) {
      throw new Error("Target item has no linked file path. Use a linked placed image for mosaic.");
    }
    const image = await timeAsync(marks, "run.mosaic.readImageBitmap", () => readImageBitmap(item.filePath));
    const sampler = timeSync(marks, "run.mosaic.createSampler", () => createCellAverageRgbaSampler(image, 3));
    const tiles = timeSync(marks, "run.mosaic.generateTiles", () =>
      generateMosaicTiles(
        item.bounds,
        {
          tileSizePt: parseLengthToPt(params.tileSize ?? "3mm"),
          gapPt: parseLengthToPt(params.gap ?? "0mm"),
          cornerRadiusPt: parseLengthToPt(params.cornerRadius ?? "0mm"),
          maxTiles: params.maxTiles ?? 20000,
          backgroundThreshold: params.backgroundThreshold ?? 0.02,
          grayscale: params.grayscale ?? false,
        },
        sampler
      )
    );
    const raw = timeSync(marks, "run.mosaic.drawMosaicTiles", () =>
      drawMosaicTiles(
        tiles,
        params.groupName ?? "MosaicTileVector",
        params.strokeCmyk as [number, number, number, number] | undefined,
        params.strokeWidth ? parseLengthToPt(params.strokeWidth) : undefined
      )
    );
    return timeSync(marks, "run.mosaic.parseIllustratorResult", () => parseIllustratorResult(raw, "tileCount"));
  } finally {
    logProfile("run", traceId, { effect: "mosaic", preview, targetUuid }, marks, startedAtMs);
  }
};

const runHalftone = async (
  targetUuid: string,
  paramsInput: z.infer<typeof halftoneParamsSchema>,
  preview: boolean,
  traceId: string
) => {
  const startedAtMs = nowMs();
  const marks: TimingMark[] = [];
  const params = { ...paramsInput };
  try {
    if (preview) {
      params.dotSpacing = params.dotSpacing ?? "3mm";
      params.maxDots = Math.min(params.maxDots ?? 2500, 5000);
      params.groupName = withPreviewName(params.groupName, "HalftoneVector");
    }

    const item = timeSync(marks, "run.halftone.getPlacedImageInfo", () => getPlacedImageInfo(targetUuid));
    if (!item.filePath) {
      throw new Error("Target item has no linked file path. Use a linked placed image for halftone.");
    }
    const image = await timeAsync(marks, "run.halftone.readImageBitmap", () => readImageBitmap(item.filePath));
    const options: HalftoneOptions = timeSync(marks, "run.halftone.buildOptions", () => ({
      dotSpacingPt: parseLengthToPt(params.dotSpacing ?? "2mm"),
      minRadiusPt: parseLengthToPt(params.minDotSize ?? "0.2mm") / 2,
      maxRadiusPt: parseLengthToPt(params.maxDotSize ?? "1.6mm") / 2,
      angleDeg: params.angleDeg ?? 45,
      invert: params.invert ?? false,
      contrast: params.contrast ?? 0,
      gamma: params.gamma ?? 1,
      dotScale: params.dotScale ?? 1,
      backgroundThreshold: params.backgroundThreshold ?? 0.06,
      maxDots: params.maxDots ?? 2500,
    }));
    const sampler = timeSync(marks, "run.halftone.createSampler", () => createCellAverageSampler(image, 3));
    const dots = timeSync(marks, "run.halftone.generateDots", () =>
      generateHalftoneDots(item.bounds, options, sampler)
    );
    const raw = timeSync(marks, "run.halftone.drawHalftoneDots", () =>
      drawHalftoneDots(
        dots,
        (params.colorCmyk as [number, number, number, number] | undefined) ?? [0, 0, 0, 100],
        params.groupName ?? "HalftoneVector"
      )
    );
    return timeSync(marks, "run.halftone.parseIllustratorResult", () =>
      parseIllustratorResult(raw, "dotCount")
    );
  } finally {
    logProfile("run", traceId, { effect: "halftone", preview, targetUuid }, marks, startedAtMs);
  }
};

export const parseRunEffectRequest = (input: unknown) => runEffectRequestSchema.parse(input);
export const parseEstimateRequest = (input: unknown) => estimateRequestSchema.parse(input);

export const estimateEffect = (request: EstimateRequest): BridgeEstimateResult => {
  const traceId = nextTraceId();
  const startedAtMs = nowMs();
  const marks: TimingMark[] = [];
  let profileError: unknown;
  try {
    const item = timeSync(marks, "estimate.getPlacedImageInfo", () => getPlacedImageInfo(request.targetUuid));
    if (!item.filePath) {
      throw new Error("Target item has no linked file path. Use a linked placed image.");
    }

    if (request.effect === "dither") {
      const params = timeSync(marks, "estimate.parseParams.dither", () =>
        ditherParamsSchema.parse(request.params ?? {})
      );
      return timeSync(marks, "estimate.compute.dither", () => estimateDither(item, params));
    }
    if (request.effect === "mosaic") {
      const params = timeSync(marks, "estimate.parseParams.mosaic", () =>
        mosaicParamsSchema.parse(request.params ?? {})
      );
      return timeSync(marks, "estimate.compute.mosaic", () => estimateMosaic(item, params));
    }
    const params = timeSync(marks, "estimate.parseParams.halftone", () =>
      halftoneParamsSchema.parse(request.params ?? {})
    );
    return timeSync(marks, "estimate.compute.halftone", () => estimateHalftone(item, params));
  } catch (error) {
    profileError = error;
    throw error;
  } finally {
    logProfile(
      "estimate",
      traceId,
      { effect: request.effect, targetUuid: request.targetUuid },
      marks,
      startedAtMs,
      profileError
    );
  }
};

export const runEffect = async (request: RunEffectRequest): Promise<BridgeRunResult> => {
  const traceId = nextTraceId();
  const startedAtMs = nowMs();
  const marks: TimingMark[] = [];
  try {
    if (request.effect === "dither") {
      const params = timeSync(marks, "run.parseParams.dither", () =>
        ditherParamsSchema.parse(request.params ?? {})
      );
      const result = await timeAsync(marks, "run.execute.dither", () =>
        runDither(request.targetUuid, params, request.preview ?? false, traceId)
      );
      logProfile(
        "run",
        traceId,
        { effect: request.effect, targetUuid: request.targetUuid, preview: request.preview ?? false },
        marks,
        startedAtMs
      );
      return result;
    }
    if (request.effect === "mosaic") {
      const params = timeSync(marks, "run.parseParams.mosaic", () =>
        mosaicParamsSchema.parse(request.params ?? {})
      );
      const result = await timeAsync(marks, "run.execute.mosaic", () =>
        runMosaic(request.targetUuid, params, request.preview ?? false, traceId)
      );
      logProfile(
        "run",
        traceId,
        { effect: request.effect, targetUuid: request.targetUuid, preview: request.preview ?? false },
        marks,
        startedAtMs
      );
      return result;
    }
    const params = timeSync(marks, "run.parseParams.halftone", () =>
      halftoneParamsSchema.parse(request.params ?? {})
    );
    const result = await timeAsync(marks, "run.execute.halftone", () =>
      runHalftone(request.targetUuid, params, request.preview ?? false, traceId)
    );
    logProfile(
      "run",
      traceId,
      { effect: request.effect, targetUuid: request.targetUuid, preview: request.preview ?? false },
      marks,
      startedAtMs
    );
    return result;
  } catch (error) {
    logProfile(
      "run",
      traceId,
      { effect: request.effect, targetUuid: request.targetUuid, preview: request.preview ?? false },
      marks,
      startedAtMs,
      error
    );
    throw error;
  }
};

export const parseExportSelectionRequest = (input: unknown) =>
  exportSelectionRequestSchema.parse(input);
export const parseReorderPresetsRequest = (input: unknown) =>
  reorderPresetsRequestSchema.parse(input);

export const exportSelection = (request: ExportSelectionRequest): BridgeExportResult => {
  const { outputPath, output, timedOutWithFile } = exportSelectionWithFallback(
    request.uuids,
    request.path,
    request.format as ExportFormat,
    request.options as ExportOptions | undefined
  );
  return {
    path: outputPath,
    timedOutWithFile,
    output,
  };
};

export const getSelectedTarget = (): BridgeSelectedTargetResult => {
  const text = listImages();
  const items = JSON.parse(text) as Array<{
    uuid: string;
    path: string;
    selected?: boolean;
  }>;
  const candidates = items.map((item) => ({
    uuid: item.uuid,
    path: item.path,
    selected: Boolean(item.selected),
  }));
  const selectedItems = candidates.filter((item) => item.selected);
  return {
    selectedUuid: selectedItems.length > 0 ? selectedItems[0].uuid : null,
    selectedCount: selectedItems.length,
    candidates,
  };
};

export const getTargetImageSize = async (targetUuid: string): Promise<BridgeTargetImageSizeResult> => {
  const item = getPlacedImageInfo(targetUuid);
  if (!item.filePath) {
    throw new Error("Target item has no linked file path. Use a linked placed image.");
  }
  const size = await readImageSize(item.filePath);
  return {
    targetUuid,
    widthPx: size.width,
    heightPx: size.height,
  };
};

export const getTargetGeometryDebug = (targetUuid: string): BridgeTargetGeometryDebugResult => {
  const item = getPlacedImageInfo(targetUuid);
  const boundsWidthPt = item.bounds.right - item.bounds.left;
  const boundsHeightPt = item.bounds.top - item.bounds.bottom;
  const format = (value: number) => value.toFixed(6);
  return {
    targetUuid,
    widthPt: item.widthPt,
    heightPt: item.heightPt,
    boundsWidthPt,
    boundsHeightPt,
    bounds: {
      left: item.bounds.left,
      top: item.bounds.top,
      right: item.bounds.right,
      bottom: item.bounds.bottom,
    },
    formatted: {
      widthPt: format(item.widthPt),
      heightPt: format(item.heightPt),
      boundsWidthPt: format(boundsWidthPt),
      boundsHeightPt: format(boundsHeightPt),
    },
  };
};

export const getItemGeometryDebug = (uuid: string): BridgeItemGeometryDebugResult => {
  const script = `
var item = getPageItem(${JSON.stringify(uuid)});
if (!item) {
  throw new Error("Target item not found");
}
var bounds = item.geometricBounds;
JSON.stringify({
  uuid: item.note || ${JSON.stringify(uuid)},
  typename: item.typename || "",
  name: item.name || "",
  widthPt: item.width,
  heightPt: item.height,
  bounds: {
    left: bounds[0],
    top: bounds[1],
    right: bounds[2],
    bottom: bounds[3]
  }
});
`;
  const parsed = JSON.parse(executeExtendScript(script)) as {
    uuid: string;
    typename: string;
    name: string;
    widthPt: number;
    heightPt: number;
    bounds: { left: number; top: number; right: number; bottom: number };
  };
  const boundsWidthPt = parsed.bounds.right - parsed.bounds.left;
  const boundsHeightPt = parsed.bounds.top - parsed.bounds.bottom;
  const format = (value: number) => value.toFixed(6);
  return {
    uuid: parsed.uuid,
    typename: parsed.typename,
    name: parsed.name,
    widthPt: parsed.widthPt,
    heightPt: parsed.heightPt,
    boundsWidthPt,
    boundsHeightPt,
    bounds: parsed.bounds,
    formatted: {
      widthPt: format(parsed.widthPt),
      heightPt: format(parsed.heightPt),
      boundsWidthPt: format(boundsWidthPt),
      boundsHeightPt: format(boundsHeightPt),
    },
  };
};

export const selectExportDirectory = (): BridgeSelectExportDirectoryResult => {
  const script = `
var selected = Folder.selectDialog("Select export directory");
JSON.stringify({
  selected: !!selected,
  path: selected ? String(selected.fsName || selected.fullName || selected.absoluteURI || "") : null
});
`;
  const parsed = JSON.parse(executeExtendScript(script)) as {
    selected?: unknown;
    path?: unknown;
  };
  const selected = Boolean(parsed.selected);
  const path = typeof parsed.path === "string" && parsed.path.trim() ? parsed.path : null;
  return {
    selected,
    path,
  };
};

const healthCheckScript = `
var docCount = app.documents.length;
var activeDocName = "";
if (docCount > 0) {
  activeDocName = app.activeDocument.name;
}
JSON.stringify({
  appName: app.name,
  appVersion: app.version,
  locale: app.locale,
  documents: docCount,
  activeDocument: activeDocName
});
`;

export const runHealthCheck = () =>
  JSON.parse(
    executeExtendScript(healthCheckScript, {
      timeoutMs: 30_000,
      retries: 1,
      requireIllustratorRunning: true,
    })
  ) as {
    appName: string;
    appVersion: string;
    locale: string;
    documents: number;
    activeDocument: string;
  };
