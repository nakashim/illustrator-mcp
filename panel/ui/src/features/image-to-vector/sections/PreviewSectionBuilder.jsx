import previewImageSrc from "../../../assets/images/preview.jpg";
import {
  renderDitherPreviewWithCore,
  renderHalftonePreviewWithCore,
  renderMosaicPreviewWithCore,
} from "../lib/ditherPreview";

const PREVIEW_CANVAS_SIZE = 280;
const SCALED_FULL_EFFECT_FACTOR = 0.5;
const PREVIEW_MODE_OPTIONS = {
  "Scaled Full": "scaled-full",
  "Actual Patch (1:1)": "actual-patch",
};

const buildSummaryText = (model) => {
  const risk = model.risk ?? "unknown";
  const estimatedShapes = model.estimatedShapes ?? "-";
  const status = model.status ?? "idle";
  const errorText = String(model.errorText ?? "").trim();
  const warningText = (model.warningText ?? "").trim();
  const hints = Array.isArray(model.hints) ? model.hints.filter((item) => typeof item === "string") : [];
  const warningOrHints =
    status === "error" && errorText
      ? [`[err] ${errorText}`]
      : [
          ...(warningText ? [`[warn] ${warningText}`] : []),
          ...hints.map((item) => `[hint] ${item}`),
        ];
  const warningLine = warningOrHints.length > 0 ? warningOrHints.join("\n") : "(none)";
  return [
    `Risk: ${risk}`,
    `Estimated shapes: ${estimatedShapes}`,
    `Status: ${status}`,
    warningLine,
  ].join("\n");
};

const drawScaledFull = (ctx, image, width, height) => {
  const fitScale = Math.min(width / image.width, height / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * fitScale));
  const drawHeight = Math.max(1, Math.round(image.height * fitScale));
  const drawRegion = {
    x: 0,
    y: 0,
    width: drawWidth,
    height: drawHeight,
  };
  ctx.drawImage(image, 0, 0, image.width, image.height, drawRegion.x, drawRegion.y, drawRegion.width, drawRegion.height);
  return {
    region: drawRegion,
    effectScale: fitScale * SCALED_FULL_EFFECT_FACTOR,
  };
};

const drawActualPatch = (ctx, image, width, height) => {
  const drawWidth = Math.max(1, Math.min(width, image.width));
  const drawHeight = Math.max(1, Math.min(height, image.height));
  const sourceX = Math.max(0, Math.floor((image.width - drawWidth) / 2));
  const sourceY = Math.max(0, Math.floor((image.height - drawHeight) / 2));
  const drawRegion = {
    x: Math.floor((width - drawWidth) / 2),
    y: Math.floor((height - drawHeight) / 2),
    width: drawWidth,
    height: drawHeight,
  };
  // 1:1 center patch from source image onto centered destination region.
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    drawWidth,
    drawHeight,
    drawRegion.x,
    drawRegion.y,
    drawRegion.width,
    drawRegion.height,
  );
  return {
    region: drawRegion,
    effectScale: 1,
  };
};

export const buildPreviewSection = (containerApi, model, actions) => {
  let image = null;
  let previewMode = "scaled-full";
  let latestEffect = model.effect;
  let latestParams = model.params;

  const previewFolder = containerApi.addFolder({
    title: "Preview",
    expanded: model.expanded ?? true,
  });
  previewFolder.on("fold", (ev) => {
    actions.setExpanded?.(Boolean(ev.expanded));
  });

  const modeRow = previewFolder.addBlade({
    view: "rowblade",
    columns: 1,
    ratios: [1],
  });
  const modeState = { previewMode };
  const modeApi = modeRow.addBinding(0, modeState, "previewMode", {
    label: "Mode",
    options: PREVIEW_MODE_OPTIONS,
  });

  const imageApi = previewFolder.addBlade({
    view: "imagecontainerblade",
    mode: "canvas",
    src: previewImageSrc,
    alt: "Preview",
    rows: 6,
  });

  const summaryState = { summaryText: buildSummaryText(model) };
  const summaryApi = previewFolder.addBinding(summaryState, "summaryText", {
    view: "textinputblade",
    label: "",
    textReadonly: true,
    rows: 6,
    fullWidth: true,
  });

  const estimateApi = previewFolder.addButton({
    title: "Estimate",
    disabled: !model.connected,
  });
  estimateApi.on("click", () => {
    actions.estimate?.();
  });

  const renderPreview = async () => {
    const canvas = imageApi.getCanvas?.();
    const ctx = imageApi.getContext2d?.();
    if (!canvas || !ctx) return;
    const width = PREVIEW_CANVAS_SIZE;
    const height = PREVIEW_CANVAS_SIZE;
    imageApi.setCanvasSize(width, height, false);

    if (!image) {
      const nextImage = new Image();
      nextImage.src = previewImageSrc;
      await nextImage.decode();
      image = nextImage;
    }
    ctx.clearRect(0, 0, width, height);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "contain";
    const drawResult = previewMode === "actual-patch"
      ? drawActualPatch(ctx, image, width, height)
      : drawScaledFull(ctx, image, width, height);

    if (latestEffect === "dither") {
      renderDitherPreviewWithCore(ctx, drawResult.region, latestParams, drawResult.effectScale);
    } else if (latestEffect === "mosaic") {
      renderMosaicPreviewWithCore(ctx, drawResult.region, latestParams, drawResult.effectScale);
    } else if (latestEffect === "halftone") {
      renderHalftonePreviewWithCore(ctx, drawResult.region, latestParams, drawResult.effectScale);
    }
  };

  modeApi.on("change", (ev) => {
    previewMode = ev.value;
    void renderPreview();
  });

  void renderPreview();

  return {
    sync(nextModel) {
      const effectChanged = latestEffect !== nextModel.effect;
      const paramsChanged = latestParams !== nextModel.params;
      latestEffect = nextModel.effect;
      latestParams = nextModel.params;
      if (effectChanged || paramsChanged) {
        void renderPreview();
      }

      const nextText = buildSummaryText(nextModel);
      if (summaryState.summaryText !== nextText) {
        summaryState.summaryText = nextText;
        summaryApi.refresh?.();
      }
      estimateApi.disabled = !nextModel.connected;
      if (typeof nextModel.expanded === "boolean" && previewFolder.expanded !== nextModel.expanded) {
        previewFolder.expanded = nextModel.expanded;
      }
    },
    dispose() {
      image = null;
    },
  };
};
