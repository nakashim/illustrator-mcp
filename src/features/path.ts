import { z } from "zod";

import { server } from "../server";
import {
  changePathItems,
  createLines,
  createRects,
  listPathItems,
} from "../adapters/illustrator";
import type { LineInput, PathChangeInput, RectInput } from "../adapters/illustrator";

// Rectangle
const createRectsSchema = z.array(
  z.object({
    position: z
      .array(z.string())
      .describe(
        "x and y coordinates. Origin is at top left. Specify in mm or Q."
      ),
    size: z.array(z.string()).describe("Width and height. Specify in mm or Q."),
  })
);

server.tool(
  "create_rects",
  "Places multiple paths representing rectangles in the document.",
  { rects: createRectsSchema },
  async ({ rects }) => {
    const output = createRects(rects as RectInput[]);
    return {
      content: [{ type: "text", text: `Created successfully.\n\n${output}` }],
    };
  }
);

// Line
const createLinesSchema = z.array(
  z.object({
    points: z
      .object({
        from: z.array(z.string()).length(2),
        to: z.array(z.string()).length(2),
      })
      .describe(
        "x and y coordinates of start and end points. Origin is at top left. Specify in mm or Q."
      ),
  })
);

server.tool(
  "create_lines",
  "Places multiple paths representing lines in the document.",
  { lines: createLinesSchema },
  async ({ lines }) => {
    const output = createLines(lines as LineInput[]);
    return {
      content: [{ type: "text", text: `Successfully created.\n\n${output}` }],
    };
  }
);

// Common
server.tool(
  "list_pathitems",
  "Gets information of existing paths.",
  {},
  async () => {
    const output = listPathItems();
    return {
      content: [{ type: "text", text: `Retrieved successfully.\n\n${output}` }],
    };
  }
);

const changePathsSchema = z
  .array(
    z.object({
      uuid: z.string(),
      fillCmyk: z
        .array(z.string())
        .optional()
        .describe("Fill color. Specify values from 0 to 100."),
      strokeCmyk: z
        .array(z.string())
        .optional()
        .describe("Stroke color. Specify values from 0 to 100."),
      strokeWidth: z
        .string()
        .optional()
        .describe("Stroke width with units. Specify in mm or Q."),
      position: z
        .array(z.string())
        .optional()
        .describe(
          "x and y coordinates with units. Origin is at top left. Specify in mm or Q."
        ),
      size: z
        .array(z.string())
        .optional()
        .describe("Width and height with units. Specify in mm or Q."),
    })
  )
  .describe("Array of UUIDs and attributes of paths to change");

server.tool(
  "change_pathitems",
  "Changes attributes of multiple paths.",
  {
    changes: changePathsSchema,
  },
  async ({ changes }) => {
    changePathItems(changes as PathChangeInput[]);
    return {
      content: [{ type: "text", text: "Changed successfully." }],
    };
  }
);
