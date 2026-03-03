import z from "zod";

import { executeExtendScript } from "../extend-utils/utils";
import { server } from "../server";

const SERVER_VERSION = "1.0.0";

type CapabilityPayload = {
  server: string;
  version: string;
  platform: string;
  mode: string;
  notes: string[];
  smokeChecks: string[];
  coreTools: string[];
};

export const buildCapabilitiesPayload = (): CapabilityPayload => ({
  server: "illustrator-mcp",
  version: SERVER_VERSION,
  platform: "macOS",
  mode: "personal-use",
  notes: [
    "AppleScript + ExtendScript bridge",
    "export logic centralized in src/features/export.ts",
    "timeout/file-existence fallback enabled for export",
  ],
  smokeChecks: [
    "create_document",
    "layer_manage(create/list)",
    "create_rects",
    "export_artifact(svg/svgz)",
  ],
  coreTools: [
    "document_*",
    "layer_manage",
    "create_rects",
    "change_*",
    "export_artifact",
  ],
});

export const buildHealthCheckScript = () => `
var docCount = app.documents.length;
var activeDocName = "";
if (docCount > 0) {
  activeDocName = app.activeDocument.name;
}
JSON.stringify({
  appName: app.name,
  appVersion: app.version,
  locale: app.locale,
  documents: docCount,
  activeDocument: activeDocName,
});
`;

server.tool(
  "get_capabilities",
  "Get server capabilities and update-safe operation profile.",
  {},
  async () => {
    const payload = buildCapabilitiesPayload();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload),
        },
      ],
    };
  }
);

server.tool(
  "health_check",
  "Verify Illustrator runtime connectivity and return app info.",
  {
    includeCapabilities: z
      .boolean()
      .optional()
      .describe("Include capability payload in the response"),
  },
  async ({ includeCapabilities }) => {
    const runtimeText = executeExtendScript(buildHealthCheckScript(), {
      timeoutMs: 30_000,
      retries: 1,
    });

    if (!includeCapabilities) {
      return {
        content: [{ type: "text", text: runtimeText }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            runtime: JSON.parse(runtimeText),
            capabilities: buildCapabilitiesPayload(),
          }),
        },
      ],
    };
  }
);
