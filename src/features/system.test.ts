import { describe, expect, it } from "vitest";

import { buildCapabilitiesPayload, buildHealthCheckScript } from "./system";

describe("system features", () => {
  it("builds capabilities payload for mac mode", () => {
    const payload = buildCapabilitiesPayload();
    expect(payload.platform).toBe("macOS");
    expect(payload.smokeChecks).toContain("create_document");
    expect(payload.coreTools).toContain("export_artifact");
  });

  it("builds health check script with Illustrator runtime fields", () => {
    const script = buildHealthCheckScript();
    expect(script).toContain("app.version");
    expect(script).toContain("JSON.stringify");
  });
});
