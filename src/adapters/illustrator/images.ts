import { executeExtendScript } from "../../extend-utils/utils";

export type ImageChangeInput = {
  uuid: string;
  path?: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  maintainAspectRatio?: boolean;
};

export const placeImages = (paths: string[]) => {
  const script = `
var doc = getDocument();
var paths = ${JSON.stringify(paths)};
var result = [];
for (var i = 0; i < paths.length; i++) {
  var image = doc.placedItems.add();
  image.file = new File(paths[i]);
  image.note = createUUID();
  result.push({ uuid: image.note });
}
JSON.stringify(result);
`;
  return executeExtendScript(script);
};

export const listImages = () => {
  const script = `
var doc = getDocument();
var result = [];
for (var i = 0; i < doc.placedItems.length; i++) {
  var item = doc.placedItems[i];
  if (!item.note) {
    item.note = createUUID();
  }
  result.push({
    uuid: item.note,
    path: item.file.name,
    x: ptToMm(item.left),
    y: ptToMm(-item.top),
    width: ptToMm(item.width),
    height: ptToMm(item.height),
    selected: item.selected,
  });
}
JSON.stringify(result);
`;
  return executeExtendScript(script);
};

export const changeImages = (changes: ImageChangeInput[]) => {
  const script = `
var inputs = ${JSON.stringify(changes)};

for (var i = 0; i < inputs.length; i++) {
  var item = getPageItem(inputs[i].uuid);
  if (inputs[i].path) {
    item.file = new File(inputs[i].path);
  }
  if (inputs[i].x) {
    item.left = toPt(inputs[i].x);
  }
  if (inputs[i].y) {
    item.top = -toPt(inputs[i].y);
  }
  if (inputs[i].width) {
    var afterWidth = toPt(inputs[i].width);
    if (inputs[i].maintainAspectRatio) {
      item.height = afterWidth * (item.height / item.width);
    }
    item.width = afterWidth;
  }
  if (inputs[i].height) {
    var afterHeight = toPt(inputs[i].height);
    if (inputs[i].maintainAspectRatio) {
      item.width = afterHeight * (item.width / item.height);
    }
    item.height = afterHeight;
  }
}
`;
  executeExtendScript(script);
};
