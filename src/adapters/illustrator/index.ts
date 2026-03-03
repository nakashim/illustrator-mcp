export { getPlacedImageInfo } from "./placed-image";
export type { PlacedImageInfo } from "./placed-image";
export { drawHalftoneDots } from "./halftone";
export { placeImages, listImages, changeImages } from "./images";
export type { ImageChangeInput } from "./images";
export {
  createTextFrames,
  listTextFrames,
  changeTextFrames,
  changeCharacters,
  listFonts,
} from "./text";
export type { TextFrameChangeInput, CharacterRangeChangeInput } from "./text";
export { createRects, createLines, listPathItems, changePathItems } from "./path";
export type { RectInput, LineInput, PathChangeInput } from "./path";
export { selectItems, groupItems, removeItems, maskItems } from "./item";
export type { MaskInput } from "./item";
export { openDocument, createDocument, saveDocument, duplicateArtboard } from "./document";
export { buildLayerManageScript, manageLayer } from "./layer";
export type { LayerAction, LayerPayload } from "./layer";
export {
  buildExportArtifactScript,
  buildExportSelectionScript,
  isExecutionTimeoutError,
  normalizeExportPath,
  exportArtifactWithFallback,
  exportSelectionWithFallback,
} from "./export";
export type { ExportFormat, ExportOptions } from "./export";
