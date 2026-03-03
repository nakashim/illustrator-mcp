import z from "zod";

import { manageLayer } from "../adapters/illustrator";
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

server.tool(
  "layer_manage",
  "Manage document layers (list/create/update/delete/set active).",
  {
    action: layerActionSchema.describe("Layer operation"),
    payload: layerPayloadSchema.describe("Layer operation payload"),
  },
  async ({ action, payload }) => {
    const output = manageLayer(action, payload);
    return {
      content: [{ type: "text", text: `Layer operation completed.\n\n${output}` }],
    };
  }
);
