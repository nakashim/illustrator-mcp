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
var targetUuid = ${toExtendScriptStringLiteral(uuid)};
var doc = getDocument();
var item = null;

// Fast path: target UUIDs originate from placedItems, so avoid scanning all pageItems.
for (var i = 0; i < doc.placedItems.length; i++) {
  if (doc.placedItems[i].note === targetUuid) {
    item = doc.placedItems[i];
    break;
  }
}

// Fallback: keep compatibility with manually entered UUIDs from non-placed page items.
if (!item) {
  for (var j = 0; j < doc.pageItems.length; j++) {
    if (doc.pageItems[j].note === targetUuid) {
      item = doc.pageItems[j];
      break;
    }
  }
}

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
