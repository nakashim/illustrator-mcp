import { executeExtendScript } from "../../extend-utils/utils";

export type LayerAction = "list" | "create" | "update" | "delete" | "set_active";

export type LayerPayload = {
  name?: string;
  newName?: string;
  visible?: boolean;
  locked?: boolean;
  printable?: boolean;
};

export const buildLayerManageScript = (
  action: LayerAction,
  payload?: LayerPayload
) => `
var doc = getDocument();
var action = ${JSON.stringify(action)};
var input = ${JSON.stringify(payload ?? {})};

function findLayerByName(name) {
  for (var i = 0; i < doc.layers.length; i++) {
    if (doc.layers[i].name === name) {
      return doc.layers[i];
    }
  }
  return null;
}

function serializeLayer(layer, index) {
  return {
    index: index,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    printable: layer.printable,
    isActive: doc.activeLayer === layer,
  };
}

var result = { action: action };

if (action === "list") {
  var layers = [];
  for (var i = 0; i < doc.layers.length; i++) {
    layers.push(serializeLayer(doc.layers[i], i));
  }
  result.layers = layers;
} else if (action === "create") {
  var layer = doc.layers.add();
  if (input.name) {
    layer.name = input.name;
  }
  if (input.visible !== undefined) {
    layer.visible = input.visible;
  }
  if (input.locked !== undefined) {
    layer.locked = input.locked;
  }
  if (input.printable !== undefined) {
    layer.printable = input.printable;
  }
  result.layer = serializeLayer(layer, doc.layers.length - 1);
} else if (action === "update") {
  if (!input.name) {
    throw new Error("name is required for update action");
  }
  var target = findLayerByName(input.name);
  if (!target) {
    throw new Error("Layer not found: " + input.name);
  }
  if (input.newName) {
    target.name = input.newName;
  }
  if (input.visible !== undefined) {
    target.visible = input.visible;
  }
  if (input.locked !== undefined) {
    target.locked = input.locked;
  }
  if (input.printable !== undefined) {
    target.printable = input.printable;
  }
  result.layer = serializeLayer(target, target.zOrderPosition - 1);
} else if (action === "delete") {
  if (!input.name) {
    throw new Error("name is required for delete action");
  }
  if (doc.layers.length <= 1) {
    throw new Error("Cannot delete the last layer");
  }
  var toDelete = findLayerByName(input.name);
  if (!toDelete) {
    throw new Error("Layer not found: " + input.name);
  }
  toDelete.remove();
  result.deleted = input.name;
} else if (action === "set_active") {
  if (!input.name) {
    throw new Error("name is required for set_active action");
  }
  var activeLayer = findLayerByName(input.name);
  if (!activeLayer) {
    throw new Error("Layer not found: " + input.name);
  }
  doc.activeLayer = activeLayer;
  result.layer = serializeLayer(activeLayer, activeLayer.zOrderPosition - 1);
}

JSON.stringify(result);
`;

export const manageLayer = (action: LayerAction, payload?: LayerPayload) =>
  executeExtendScript(buildLayerManageScript(action, payload));
