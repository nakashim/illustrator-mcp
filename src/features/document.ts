import z from "zod";

import { server } from "../server";
import {
  createDocument,
  duplicateArtboard,
  openDocument,
  saveDocument,
} from "../adapters/illustrator";

server.tool(
  "open_document",
  "Opens a document.",
  {
    path: z.string().describe("Absolute path of the document to open"),
  },
  async ({ path }) => {
    openDocument(path);
    return {
      content: [{ type: "text", text: "Document opened." }],
    };
  }
);

server.tool(
  "create_document",
  "Create a document.",
  {
    width: z
      .string()
      .describe("Width of the document with units. Specify in mm."),
    height: z
      .string()
      .describe("Height of the document with units. Specify in mm."),
  },
  async ({ width, height }) => {
    createDocument(width, height);
    return {
      content: [{ type: "text", text: "Document created." }],
    };
  }
);

server.tool(
  "save_document",
  "Saves the document.",
  {
    path: z
      .string()
      .optional()
      .describe("Absolute path of the document to save"),
  },
  async ({ path }) => {
    saveDocument(path);
    return {
      content: [{ type: "text", text: "Document saved." }],
    };
  }
);

server.tool(
  "duplicate_artboard",
  "Duplicates the first artboard.",
  {
    count: z.number().describe("Number of artboards to duplicate"),
  },
  async ({ count }) => {
    duplicateArtboard(count);
    return {
      content: [{ type: "text", text: "Artboard duplicated." }],
    };
  }
);
