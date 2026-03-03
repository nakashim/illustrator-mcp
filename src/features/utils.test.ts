import { describe, expect, it } from "vitest";

import { evaluateArithmeticExpression } from "./utils";

describe("evaluateArithmeticExpression", () => {
  it("evaluates numeric arithmetic expressions", () => {
    const result = evaluateArithmeticExpression("1 + 2 * (3 + 4)");
    expect(result).toEqual({
      expression: "1 + 2 * (3 + 4)",
      result: 15,
    });
  });

  it("rejects non arithmetic expressions", () => {
    const result = evaluateArithmeticExpression("process.exit(1)");
    expect(result).toEqual({
      expression: "process.exit(1)",
      error: "Invalid expression. Only numeric arithmetic is allowed.",
    });
  });
});
