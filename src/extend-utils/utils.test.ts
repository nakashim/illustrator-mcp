import { describe, expect, it } from "vitest";

import { shouldRetryExecutionError } from "./utils";

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
