import { describe, expect, it } from "vitest";

import {
  classifyExecutionError,
  shouldRetryExecutionError,
  toExtendScriptStringLiteral,
} from "./utils";

describe("shouldRetryExecutionError", () => {
  it("returns true for transient AppleEvent connection issues", () => {
    expect(
      shouldRetryExecutionError({
        message: "Error received in message reply handler: Connection invalid",
      })
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(
      shouldRetryExecutionError({
        message: "spawnSync osascript ETIMEDOUT",
      })
    ).toBe(false);
  });
});

describe("classifyExecutionError", () => {
  it("classifies timeout errors", () => {
    expect(
      classifyExecutionError({ message: "spawnSync osascript ETIMEDOUT" }).kind
    ).toBe("timeout");
  });

  it("classifies permission errors", () => {
    expect(
      classifyExecutionError({
        message: "Not authorized to send Apple events to Adobe Illustrator",
      }).kind
    ).toBe("permission_denied");
  });
});

describe("toExtendScriptStringLiteral", () => {
  it("returns JSON-escaped string literal", () => {
    expect(toExtendScriptStringLiteral('a"b')).toBe('"a\\"b"');
  });
});
