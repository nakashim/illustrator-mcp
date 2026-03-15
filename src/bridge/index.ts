import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { EffectType, RunEffectRequest } from "./effects";
import {
  effectTypeSchema,
  estimateEffect,
  exportSelection,
  getItemGeometryDebug,
  selectExportDirectory,
  getTargetGeometryDebug,
  getTargetImageSize,
  parseExportSelectionRequest,
  getSelectedTarget,
  parseEstimateRequest,
  parseReorderPresetsRequest,
  parseRunEffectRequest,
  runEffect,
  runHealthCheck,
} from "./effects";
import {
  deletePreset as deleteStoredPreset,
  listPresetNames as listStoredPresetNames,
  readPreset as readStoredPreset,
  reorderPresetNames as reorderStoredPresetNames,
  upsertPreset as upsertStoredPreset,
} from "./presets-store";
import { patchUiState, readUiState } from "./ui-state-store";

type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

type JobError = {
  code: string;
  message: string;
  retryable: boolean;
  suggestion?: string;
};

type JobResult = {
  groupUuid: string;
  groupName: string;
  count: number;
  elapsedMs: number;
  warnings: string[];
  debug?: Record<string, unknown>;
};

type BridgeJob = {
  id: string;
  status: JobStatus;
  effect: EffectType;
  request: RunEffectRequest;
  createdAt: string;
  updatedAt: string;
  startedAt?: number;
  finishedAt?: number;
  cancelRequested: boolean;
  result: JobResult | null;
  error: JobError | null;
};

const BRIDGE_VERSION = "0.1.0";
const MCP_VERSION = "1.0.0";
const PORT = Number(process.env.ILLUSTRATOR_BRIDGE_PORT ?? "43123");
const HOST = process.env.ILLUSTRATOR_BRIDGE_HOST ?? "127.0.0.1";

if (!process.env.ILLUSTRATOR_MCP_TMP_DIR) {
  const fallbackTmpDir = resolve(process.cwd(), "illustrator-mcp-tmp");
  mkdirSync(fallbackTmpDir, { recursive: true });
  process.env.ILLUSTRATOR_MCP_TMP_DIR = fallbackTmpDir;
}

const jobs = new Map<string, BridgeJob>();
const jobQueue: string[] = [];
let activeJobId: string | null = null;

const nowIso = () => new Date().toISOString();
const nowMs = () => Number(process.hrtime.bigint()) / 1_000_000;
const shouldLogProfile = () => process.env.ILLUSTRATOR_BRIDGE_PROFILE === "1";
const logBridgeProfile = (payload: Record<string, unknown>) => {
  if (!shouldLogProfile()) return;
  console.info(`[bridge:profile] ${JSON.stringify(payload)}`);
};

const updateJob = (id: string, patch: Partial<BridgeJob>) => {
  const job = jobs.get(id);
  if (!job) {
    return;
  }
  const next: BridgeJob = {
    ...job,
    ...patch,
    updatedAt: nowIso(),
  };
  jobs.set(id, next);
};

const classifyJobError = (error: unknown): JobError => {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  if (lowered.includes("timed out") || lowered.includes("timeout")) {
    return {
      code: "ILLUSTRATOR_TIMEOUT",
      message,
      retryable: true,
      suggestion: "Increase pixel/tile size and retry.",
    };
  }
  if (lowered.includes("no linked file path")) {
    return {
      code: "INVALID_TARGET",
      message,
      retryable: false,
      suggestion: "Select a linked placed image and retry.",
    };
  }
  return {
    code: "BRIDGE_RUN_FAILED",
    message,
    retryable: false,
  };
};

const processQueue = async () => {
  if (activeJobId !== null) {
    return;
  }
  const nextId = jobQueue.shift();
  if (!nextId) {
    return;
  }
  const job = jobs.get(nextId);
  if (!job) {
    return processQueue();
  }
  if (job.cancelRequested) {
    updateJob(nextId, { status: "cancelled", finishedAt: Date.now() });
    return processQueue();
  }

  activeJobId = nextId;
  const queuedMs = Math.max(0, Date.now() - Date.parse(job.createdAt));
  updateJob(nextId, {
    status: "running",
    startedAt: Date.now(),
  });

  try {
    const runStartedMs = nowMs();
    const runResult = await runEffect(job.request);
    logBridgeProfile({
      kind: "run-job",
      jobId: nextId,
      effect: job.effect,
      queuedMs: Number(queuedMs.toFixed(2)),
      runEffectMs: Number((nowMs() - runStartedMs).toFixed(2)),
    });
    const finishedAt = Date.now();
    const startedAt = jobs.get(nextId)?.startedAt ?? finishedAt;
    updateJob(nextId, {
      status: "done",
      finishedAt,
      result: {
        groupUuid: runResult.groupUuid,
        groupName: runResult.groupName,
        count: runResult.count,
        elapsedMs: Math.max(0, finishedAt - startedAt),
        debug: runResult.debug,
        warnings: job.cancelRequested
          ? ["Cancel was requested during execution but could not interrupt this run."]
          : [],
      },
    });
  } catch (error) {
    updateJob(nextId, {
      status: "error",
      finishedAt: Date.now(),
      error: classifyJobError(error),
    });
  } finally {
    activeJobId = null;
    void processQueue();
  }
};

const parseRequestBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as unknown;
};

const sendJson = (res: ServerResponse<IncomingMessage>, statusCode: number, payload: unknown) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString(),
  });
  res.end(body);
};

const sendError = (
  res: ServerResponse<IncomingMessage>,
  statusCode: number,
  code: string,
  error: string,
  detail?: string,
) =>
  sendJson(res, statusCode, {
    code,
    error,
    ...(detail ? { detail } : {}),
  });

const createJob = (request: RunEffectRequest): BridgeJob => {
  const id = `job_${randomUUID()}`;
  const createdAt = nowIso();
  const job: BridgeJob = {
    id,
    status: "queued",
    effect: request.effect,
    request,
    createdAt,
    updatedAt: createdAt,
    cancelRequested: false,
    result: null,
    error: null,
  };
  jobs.set(id, job);
  jobQueue.push(id);
  void processQueue();
  return job;
};

const parseEffectType = (value: string): EffectType => effectTypeSchema.parse(value);

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    return sendError(res, 400, "INPUT_BAD_REQUEST", "Bad request");
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      let runtime: ReturnType<typeof runHealthCheck> | null = null;
      let connectionError: string | null = null;
      try {
        runtime = runHealthCheck();
      } catch (error) {
        connectionError = error instanceof Error ? error.message : String(error);
      }
      return sendJson(res, 200, {
        ok: connectionError === null,
        bridgeVersion: BRIDGE_VERSION,
        mcpVersion: MCP_VERSION,
        illustrator: {
          connected: connectionError === null,
          runtime,
          error: connectionError,
        },
      });
    }

    if (req.method === "POST" && (url.pathname === "/run" || url.pathname === "/preview")) {
      const startedMs = nowMs();
      const parseBodyStartMs = nowMs();
      const body = await parseRequestBody(req);
      const parseBodyMs = nowMs() - parseBodyStartMs;
      const parseRequestStartMs = nowMs();
      const parsed = parseRunEffectRequest({
        ...(body as Record<string, unknown>),
        preview: url.pathname === "/preview" ? true : (body as Record<string, unknown>).preview,
      });
      const parseRequestMs = nowMs() - parseRequestStartMs;
      const createJobStartMs = nowMs();
      const job = createJob(parsed);
      const createJobMs = nowMs() - createJobStartMs;
      logBridgeProfile({
        kind: "run-request",
        endpoint: url.pathname,
        jobId: job.id,
        effect: parsed.effect,
        parseBodyMs: Number(parseBodyMs.toFixed(2)),
        parseRequestMs: Number(parseRequestMs.toFixed(2)),
        createJobMs: Number(createJobMs.toFixed(2)),
        totalMs: Number((nowMs() - startedMs).toFixed(2)),
      });
      return sendJson(res, 202, { jobId: job.id, status: job.status });
    }

    if (req.method === "POST" && url.pathname === "/estimate") {
      const startedMs = nowMs();
      const parseBodyStartMs = nowMs();
      const body = await parseRequestBody(req);
      const parseBodyMs = nowMs() - parseBodyStartMs;
      const parseRequestStartMs = nowMs();
      const parsed = parseEstimateRequest(body);
      const parseRequestMs = nowMs() - parseRequestStartMs;
      const estimateStartMs = nowMs();
      const estimate = estimateEffect(parsed);
      const estimateMs = nowMs() - estimateStartMs;
      logBridgeProfile({
        kind: "estimate-request",
        endpoint: url.pathname,
        effect: parsed.effect,
        parseBodyMs: Number(parseBodyMs.toFixed(2)),
        parseRequestMs: Number(parseRequestMs.toFixed(2)),
        estimateMs: Number(estimateMs.toFixed(2)),
        totalMs: Number((nowMs() - startedMs).toFixed(2)),
      });
      return sendJson(res, 200, estimate);
    }

    if (req.method === "POST" && url.pathname === "/export/selection") {
      const body = await parseRequestBody(req);
      const parsed = parseExportSelectionRequest(body);
      const exported = exportSelection(parsed);
      return sendJson(res, 200, exported);
    }

    if (req.method === "GET" && url.pathname === "/targets/selected") {
      const selected = getSelectedTarget();
      return sendJson(res, 200, selected);
    }

    if (req.method === "GET" && url.pathname === "/presets") {
      const effectRaw = (url.searchParams.get("effect") ?? "").trim();
      if (!effectRaw) {
        return sendError(res, 400, "INPUT_MISSING_EFFECT", "Missing query parameter: effect");
      }
      const effect = parseEffectType(effectRaw);
      const names = listStoredPresetNames(effect);
      return sendJson(res, 200, { effect, names });
    }

    const isPresetOrderPath = url.pathname === "/presets/order" || url.pathname === "/presets/order/";
    if (req.method === "PUT" && isPresetOrderPath) {
      const body = await parseRequestBody(req);
      const parsed = parseReorderPresetsRequest(body);
      const names = reorderStoredPresetNames(parsed.effect, parsed.names);
      return sendJson(res, 200, { effect: parsed.effect, names });
    }

    if (isPresetOrderPath) {
      return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    if (url.pathname.startsWith("/presets/")) {
      const parts = url.pathname.split("/");
      if (parts.length !== 4 || !parts[2] || !parts[3]) {
        return sendError(res, 400, "PRESET_INVALID_PATH", "Invalid presets path");
      }
      const effect = parseEffectType(decodeURIComponent(parts[2]));
      const name = decodeURIComponent(parts[3]).trim();
      if (!name) {
        return sendError(res, 400, "PRESET_NAME_REQUIRED", "Preset name is required");
      }

      if (req.method === "GET") {
        const preset = readStoredPreset(effect, name);
        if (!preset) {
          return sendError(res, 404, "PRESET_NOT_FOUND", "Preset not found");
        }
        return sendJson(res, 200, { effect, name, preset });
      }

      if (req.method === "PUT") {
        const body = (await parseRequestBody(req)) as Record<string, unknown>;
        const params =
          body.params && typeof body.params === "object"
            ? (body.params as Record<string, unknown>)
            : {};
        const groupName = typeof body.groupName === "string" ? body.groupName : undefined;
        const preset = upsertStoredPreset({ effect, name, params, groupName });
        return sendJson(res, 200, { effect, name, preset });
      }

      if (req.method === "DELETE") {
        const deleted = deleteStoredPreset(effect, name);
        if (!deleted) {
          return sendError(res, 404, "PRESET_NOT_FOUND", "Preset not found");
        }
        return sendJson(res, 200, { ok: true, effect, name });
      }
    }

    if (req.method === "GET" && url.pathname === "/ui-state") {
      return sendJson(res, 200, readUiState());
    }

    if (req.method === "PUT" && url.pathname === "/ui-state") {
      const body = await parseRequestBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return sendError(res, 400, "UI_STATE_INVALID_PATCH_BODY", "Invalid ui-state patch body");
      }
      const next = patchUiState(body as Record<string, unknown>);
      return sendJson(res, 200, next);
    }

    if (req.method === "GET" && url.pathname.startsWith("/targets/") && url.pathname.endsWith("/image-size")) {
      const parts = url.pathname.split("/");
      if (parts.length !== 4 || !parts[2]) {
        return sendError(res, 400, "TARGET_IMAGE_SIZE_PATH_INVALID", "Invalid target image-size path");
      }
      const targetUuid = decodeURIComponent(parts[2]);
      const size = await getTargetImageSize(targetUuid);
      return sendJson(res, 200, size);
    }

    if (req.method === "GET" && url.pathname.startsWith("/targets/") && url.pathname.endsWith("/debug-geometry")) {
      const parts = url.pathname.split("/");
      if (parts.length !== 4 || !parts[2]) {
        return sendError(
          res,
          400,
          "TARGET_GEOMETRY_PATH_INVALID",
          "Invalid target debug-geometry path",
        );
      }
      const targetUuid = decodeURIComponent(parts[2]);
      const geometry = getTargetGeometryDebug(targetUuid);
      return sendJson(res, 200, geometry);
    }

    if (req.method === "GET" && url.pathname.startsWith("/items/") && url.pathname.endsWith("/debug-geometry")) {
      const parts = url.pathname.split("/");
      if (parts.length !== 4 || !parts[2]) {
        return sendError(res, 400, "ITEM_GEOMETRY_PATH_INVALID", "Invalid item debug-geometry path");
      }
      const itemUuid = decodeURIComponent(parts[2]);
      const geometry = getItemGeometryDebug(itemUuid);
      return sendJson(res, 200, geometry);
    }

    if (req.method === "GET" && url.pathname === "/dialogs/select-export-directory") {
      const selected = selectExportDirectory();
      return sendJson(res, 200, selected);
    }

    if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
      const jobId = url.pathname.replace("/jobs/", "");
      const job = jobs.get(jobId);
      if (!job) {
        return sendError(res, 404, "JOB_NOT_FOUND", "Job not found");
      }
      return sendJson(res, 200, {
        id: job.id,
        effect: job.effect,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        progress: job.status === "queued" ? 0 : job.status === "running" ? 0.5 : 1,
        result: job.result,
        error: job.error,
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/cancel") && url.pathname.startsWith("/jobs/")) {
      const jobId = url.pathname.replace("/jobs/", "").replace("/cancel", "");
      const job = jobs.get(jobId);
      if (!job) {
        return sendError(res, 404, "JOB_NOT_FOUND", "Job not found");
      }
      if (job.status === "queued") {
        updateJob(jobId, { status: "cancelled", cancelRequested: true, finishedAt: Date.now() });
        const index = jobQueue.indexOf(jobId);
        if (index >= 0) {
          jobQueue.splice(index, 1);
        }
        return sendJson(res, 200, { ok: true, status: "cancelled" });
      }
      updateJob(jobId, { cancelRequested: true });
      return sendJson(res, 202, {
        ok: true,
        status: job.status,
        note: "Cancellation requested. Running ExtendScript cannot be interrupted immediately.",
      });
    }

    return sendError(res, 404, "ROUTE_NOT_FOUND", "Not found");
  } catch (error) {
    if (error instanceof SyntaxError) {
      return sendError(res, 400, "INPUT_INVALID_JSON_BODY", "Invalid JSON body");
    }
    if (error instanceof Error && error.name === "ZodError") {
      return sendError(res, 400, "INPUT_INVALID_REQUEST", "Invalid request", error.message);
    }
    return sendError(
      res,
      500,
      "BRIDGE_INTERNAL_ERROR",
      "Bridge error",
      error instanceof Error ? error.message : String(error),
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Illustrator bridge listening on http://${HOST}:${PORT}`);
});
