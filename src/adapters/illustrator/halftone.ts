import { executeExtendScript } from "../../extend-utils/utils";
import type { Dot } from "../../core/halftone";
import type { MosaicTile } from "../../core/mosaic";

const buildDrawHalftoneScript = (
  dots: Dot[],
  cmyk: [number, number, number, number],
  groupName: string
) => `
var doc = getDocument();
var dots = ${JSON.stringify(dots)};
var group = doc.groupItems.add();
group.note = createUUID();
group.name = ${JSON.stringify(groupName)};

var color = new CMYKColor();
color.cyan = ${cmyk[0]};
color.magenta = ${cmyk[1]};
color.yellow = ${cmyk[2]};
color.black = ${cmyk[3]};

for (var i = 0; i < dots.length; i++) {
  var d = dots[i];
  var circle = doc.pathItems.ellipse(d.y + d.r, d.x - d.r, d.r * 2, d.r * 2);
  circle.stroked = false;
  circle.filled = true;
  circle.fillColor = color;
  circle.note = createUUID();
  circle.moveToBeginning(group);
}

JSON.stringify({
  groupUuid: group.note,
  groupName: group.name,
  dotCount: dots.length
});
`;

export const drawHalftoneDots = (
  dots: Dot[],
  cmyk: [number, number, number, number],
  groupName: string
) =>
  executeExtendScript(buildDrawHalftoneScript(dots, cmyk, groupName), {
    timeoutMs: 180_000,
    retries: 1,
  });

const buildDrawMosaicTilesScript = (
  tiles: MosaicTile[],
  groupName: string,
  strokeCmyk?: [number, number, number, number],
  strokeWidthPt?: number
) => `
var doc = getDocument();
var tiles = ${JSON.stringify(tiles)};
var group = doc.groupItems.add();
group.note = createUUID();
group.name = ${JSON.stringify(groupName)};

var hasStroke = ${strokeCmyk ? "true" : "false"};
var strokeWidth = ${strokeWidthPt ?? 0};
var strokeColor = null;
if (hasStroke) {
  strokeColor = new CMYKColor();
  strokeColor.cyan = ${(strokeCmyk ?? [0, 0, 0, 0])[0]};
  strokeColor.magenta = ${(strokeCmyk ?? [0, 0, 0, 0])[1]};
  strokeColor.yellow = ${(strokeCmyk ?? [0, 0, 0, 0])[2]};
  strokeColor.black = ${(strokeCmyk ?? [0, 0, 0, 0])[3]};
}

for (var i = 0; i < tiles.length; i++) {
  var t = tiles[i];
  var shape = null;
  if (t.radius > 0.01) {
    shape = doc.pathItems.roundedRectangle(t.y, t.x, t.width, t.height, t.radius, t.radius);
  } else {
    shape = doc.pathItems.rectangle(t.y, t.x, t.width, t.height);
  }
  var fill = new CMYKColor();
  fill.cyan = t.fillCmyk[0];
  fill.magenta = t.fillCmyk[1];
  fill.yellow = t.fillCmyk[2];
  fill.black = t.fillCmyk[3];
  shape.filled = true;
  shape.fillColor = fill;
  shape.stroked = hasStroke;
  if (hasStroke) {
    shape.strokeColor = strokeColor;
    shape.strokeWidth = strokeWidth;
  }
  shape.note = createUUID();
  shape.moveToBeginning(group);
}

JSON.stringify({
  groupUuid: group.note,
  groupName: group.name,
  tileCount: tiles.length
});
`;

export const drawMosaicTiles = (
  tiles: MosaicTile[],
  groupName: string,
  strokeCmyk?: [number, number, number, number],
  strokeWidthPt?: number
) =>
  executeExtendScript(
    buildDrawMosaicTilesScript(tiles, groupName, strokeCmyk, strokeWidthPt),
    { timeoutMs: 180_000, retries: 1 }
  );
