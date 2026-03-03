import {
  executeExtendScript,
  toExtendScriptStringLiteral,
} from "../../extend-utils/utils";
import type { Bounds } from "../../core/halftone";

export type PlacedImageInfo = {
  uuid: string;
  typename: string;
  filePath: string;
  widthPt: number;
  heightPt: number;
  bounds: Bounds;
};

const buildPlacedImageInfoScript = (uuid: string) => `
var item = getPageItem(${toExtendScriptStringLiteral(uuid)});
if (!item) {
  throw new Error("Target item not found");
}
var bounds = item.geometricBounds;
var filePath = "";
try {
  if (item.file) {
    filePath = item.file.fsName || item.file.fullName || item.file.absoluteURI || item.file.toString();
  }
} catch (e) {
  filePath = "";
}
JSON.stringify({
  uuid: item.note,
  typename: item.typename,
  filePath: filePath,
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

export const getPlacedImageInfo = (uuid: string): PlacedImageInfo => {
  const text = executeExtendScript(buildPlacedImageInfoScript(uuid));
  return JSON.parse(text) as PlacedImageInfo;
};
