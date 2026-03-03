import { executeExtendScript } from "../../extend-utils/utils";

export type RectInput = {
  position: string[];
  size: string[];
};

export type LineInput = {
  points: {
    from: string[];
    to: string[];
  };
};

export type PathChangeInput = {
  uuid: string;
  fillCmyk?: string[];
  strokeCmyk?: string[];
  strokeWidth?: string;
  position?: string[];
  size?: string[];
};

export const createRects = (rects: RectInput[]) => {
  const script = `
var doc = getDocument();
var inputs = ${JSON.stringify(rects)};
var result = [];

for (var i = 0; i < inputs.length; i++) {
  var x = toPt(inputs[i].position[0]);
  var y = -toPt(inputs[i].position[1]);
  var width = toPt(inputs[i].size[0]);
  var height = toPt(inputs[i].size[1]);
  var rect = doc.pathItems.rectangle(y, x, width, height);
  rect.note = createUUID();
  result.push({ uuid: rect.note });
}
JSON.stringify(result);`;
  return executeExtendScript(script);
};

export const createLines = (lines: LineInput[]) => {
  const script = `
var doc = getDocument();
var inputs = ${JSON.stringify(lines)};
var result = [];

for (var i = 0; i < inputs.length; i++) {
  var fromX = toPt(inputs[i].points.from[0]);
  var fromY = -toPt(inputs[i].points.from[1]);
  var toX = toPt(inputs[i].points.to[0]);
  var toY = -toPt(inputs[i].points.to[1]);

  var line = doc.pathItems.add();
  line.note = createUUID();
  line.stroked = true;
  line.filled = false;
  line.setEntirePath([[fromX, fromY], [toX, toY]]);
  result.push({ uuid: line.note });
}
JSON.stringify(result);
`;
  return executeExtendScript(script);
};

export const listPathItems = () => {
  const script = `
var doc = getDocument();
var result = [];
for (var i = 0; i < doc.pathItems.length; i++) {
  var item = doc.pathItems[i];
  if (!item.note) {
    item.note = createUUID();
  }
  result.push({
    uuid: item.note,
    name: item.name,
    position: [ptToMm(item.left), ptToMm(-item.top)],
    size: [ptToMm(item.width), ptToMm(item.height)],
    selected: item.selected,
  });
}
JSON.stringify(result);
`;
  return executeExtendScript(script);
};

export const changePathItems = (changes: PathChangeInput[]) => {
  const script = `
var inputs = ${JSON.stringify(changes)};

for (var i = 0; i < inputs.length; i++) {
  var item = getPageItem(inputs[i].uuid);
  if (inputs[i].fillCmyk) {
    var cmyk = new CMYKColor();
    cmyk.cyan = inputs[i].fillCmyk[0];
    cmyk.magenta = inputs[i].fillCmyk[1];
    cmyk.yellow = inputs[i].fillCmyk[2];
    cmyk.black = inputs[i].fillCmyk[3];
    item.filled = true;
    item.fillColor = cmyk;
  }
  if (inputs[i].strokeCmyk) {
    var cmyk = new CMYKColor();
    cmyk.cyan = inputs[i].strokeCmyk[0];
    cmyk.magenta = inputs[i].strokeCmyk[1];
    cmyk.yellow = inputs[i].strokeCmyk[2];
    cmyk.black = inputs[i].strokeCmyk[3];
    item.stroked = true;
    item.strokeColor = cmyk;
  }
  if (inputs[i].strokeWidth !== undefined) {
    item.strokeWidth = toPt(inputs[i].strokeWidth);
  }
  if (inputs[i].size) {
    var targetWidth = toPt(inputs[i].size[0]);
    var targetHeight = toPt(inputs[i].size[1]);
    var originalWidth = item.width;
    var originalHeight = item.height;
    var scaleX = (targetWidth / originalWidth) * 100;
    var scaleY = (targetHeight / originalHeight) * 100;
    var scaleMatrix = app.getScaleMatrix(scaleX, scaleY);
    item.transform(scaleMatrix, true, true, true, true, 1, Transformation.CENTER);
  }
  if (inputs[i].position) {
    var x = toPt(inputs[i].position[0]);
    var y = -toPt(inputs[i].position[1]);
    item.position = [x, y];
  }
}
`;
  executeExtendScript(script);
};
