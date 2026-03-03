import { z } from "zod";

import { server } from "../server";
import { groupItems, maskItems, removeItems, selectItems } from "../adapters/illustrator";
import type { MaskInput } from "../adapters/illustrator";

server.tool(
  "select_items",
  "Selects multiple objects.",
  {
    uuids: z.array(z.string()).describe("Array of UUIDs"),
  },
  async ({ uuids }) => {
    selectItems(uuids);
    return {
      content: [{ type: "text", text: "Objects selected." }],
    };
  }
);

server.tool(
  "group_items",
  "Groups multiple objects.",
  {
    uuids: z.array(z.string()).describe("Array of UUIDs"),
  },
  async ({ uuids }) => {
    groupItems(uuids);
    return {
      content: [{ type: "text", text: "Objects grouped." }],
    };
  }
);

server.tool(
  "remove_items",
  "Removes multiple objects.",
  {
    uuids: z.array(z.string()).describe("Array of UUIDs"),
  },
  async ({ uuids }) => {
    removeItems(uuids);
    return {
      content: [{ type: "text", text: "Objects removed." }],
    };
  }
);

const maskItemsSchema = z
  .array(
    z.object({
      maskUuid: z.string().describe("UUID of the path to be used as a mask"),
      maskedUuids: z
        .array(z.string())
        .describe("Array of UUIDs of objects to be masked"),
    })
  )
  .describe("Mask information");

server.tool(
  "mask_items",
  "Masks multiple objects.",
  {
    masks: maskItemsSchema,
  },
  async ({ masks }) => {
    maskItems(masks as MaskInput[]);
    return {
      content: [{ type: "text", text: "Objects masked." }],
    };
  }
);
