import z from "zod";

import { server } from "../server";
import {
  changeCharacters,
  changeTextFrames,
  createTextFrames,
  listFonts,
  listTextFrames,
} from "../adapters/illustrator";
import type { CharacterRangeChangeInput, TextFrameChangeInput } from "../adapters/illustrator";

server.tool(
  "create_textframes",
  "Places multiple text frames in the document.",
  { count: z.number().describe("Number of text frames to place") },
  async ({ count }) => {
    const output = createTextFrames(count);
    return {
      content: [
        {
          type: "text",
          text: `Placed successfully.\n\n${output}`,
        },
      ],
    };
  }
);

server.tool(
  "list_textframes",
  "Gets information of existing text frames.",
  {},
  async () => {
    const output = listTextFrames();
    return {
      content: [{ type: "text", text: `Retrieved successfully.\n\n${output}` }],
    };
  }
);

const changeTextFramesSchema = z
  .array(
    z.object({
      uuid: z.string().describe("UUID"),
      text: z.string().optional().describe("Text content"),
      fontName: z.string().optional().describe("Font name"),
      fontSize: z
        .string()
        .optional()
        .describe("Font size (specify in mm or Q)"),
      justification: z
        .enum(["left", "center", "right", "justify"])
        .optional()
        .describe(
          "Text alignment direction. left: left, center: center, right: right, justify: justify."
        ),
      colorCmyk: z
        .array(z.number())
        .length(4)
        .optional()
        .describe("Text color (array of CMYK values from 0 to 100)"),
      position: z
        .array(z.string())
        .optional()
        .describe(
          "X and Y coordinates with units. Origin at top left. Specify in mm or Q."
        ),
      size: z
        .array(z.string())
        .optional()
        .describe("Width and height with units. Specify in mm or Q."),
    })
  )
  .describe("Array of UUIDs and attributes of text frames to change");

server.tool(
  "change_textframes",
  "Changes attributes of multiple text frames. Maximum 10 items.",
  {
    changes: changeTextFramesSchema,
  },
  async ({ changes }) => {
    changeTextFrames(changes as TextFrameChangeInput[]);
    return {
      content: [{ type: "text", text: "Changed successfully." }],
    };
  }
);

const changeCharactersSchema = z.array(
  z.object({
    range: z.object({ from: z.number(), to: z.number() }),
    fontName: z.string().optional().describe("Font name"),
    fontSize: z.string().optional().describe("Font size. Specify in mm or Q."),
    lineHeight: z
      .string()
      .optional()
      .describe("Line height. Specify in mm or Q."),
    baselineShift: z
      .string()
      .optional()
      .describe("Baseline shift. Specify in mm or Q."),
    horizontalScale: z
      .number()
      .optional()
      .describe("Horizontal scale (100 means 100%)"),
    verticalScale: z
      .number()
      .optional()
      .describe("Vertical scale (100 means 100%)"),
    colorCmyk: z
      .array(z.number())
      .length(4)
      .optional()
      .describe("Text color. Array of CMYK values from 0 to 100."),
  })
);

server.tool(
  "change_characters",
  "Changes attributes of multiple character ranges in a single text frame. Maximum 10 items.",
  {
    uuid: z.string(),
    changes: changeCharactersSchema,
  },
  async ({ uuid, changes }) => {
    changeCharacters(uuid, changes as CharacterRangeChangeInput[]);
    return {
      content: [{ type: "text", text: "Changed successfully." }],
    };
  }
);

server.tool("list_fonts", "Get list of available fonts", {}, async () => {
  const output = listFonts();
  return {
    content: [{ type: "text", text: `Retrieved successfully.\n\n${output}` }],
  };
});
