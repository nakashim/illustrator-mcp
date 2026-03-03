import z from "zod";

import { executeExtendScript } from "../extend-utils/utils";
import { server } from "../server";

const layerActionSchema = z.enum([
  "list",
  "create",
  "update",
  "delete",
  "set_active",
]);

const layerPayloadSchema = z
  .object({
    name: z.string().optional().describe("Layer name"),
    newName: z.string().optional().describe("Renamed layer name"),
    visible: z.boolean().optional().describe("Layer visibility"),
    locked: z.boolean().optional().describe("Layer lock state"),
    printable: z.boolean().optional().describe("Layer printable state"),
  })
  .optional();

export const buildLayerManageScript = (
  action: z.infer<typeof layerActionSchema>,
  payload?: z.infer<typeof layerPayloadSchema>
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

server.tool(
  "layer_manage",
  "Manage document layers (list/create/update/delete/set active).",
  {
    action: layerActionSchema.describe("Layer operation"),
    payload: layerPayloadSchema.describe("Layer operation payload"),
  },
  async ({ action, payload }) => {
    const output = executeExtendScript(buildLayerManageScript(action, payload));
    return {
      content: [{ type: "text", text: `Layer operation completed.\n\n${output}` }],
    };
  }
);
