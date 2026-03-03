import { server } from "../server";
import { z } from "zod";

const SAFE_EXPRESSION_PATTERN = /^[0-9+\-*/%().,\s]+$/;

export const evaluateArithmeticExpression = (expression: string) => {
  if (!SAFE_EXPRESSION_PATTERN.test(expression)) {
    return {
      expression: expression,
      error: "Invalid expression. Only numeric arithmetic is allowed.",
    };
  }

  try {
    return {
      expression: expression,
      result: new Function(`"use strict"; return (${expression});`)(),
    };
  } catch {
    return {
      expression: expression,
      error: "Failed to evaluate expression.",
    };
  }
};

server.tool(
  "calc_expressions",
  "Calculates the results of the expressions.",
  { expressions: z.array(z.string()).describe("expressions") },
  async ({ expressions }) => {
    const result = expressions.map(evaluateArithmeticExpression);

    return {
      content: [
        {
          type: "text",
          text: `Calculated successfully.\n\n${JSON.stringify(result)}`,
        },
      ],
    };
  }
);

server.tool(
  "count_characters",
  "Counts the number of characters in each line.",
  { lines: z.array(z.string()).describe("Lines") },
  async ({ lines }) => {
    const result = lines.map((line) => {
      return {
        line: line,
        count: line.length,
      };
    });
    return {
      content: [
        {
          type: "text",
          text: `Counted successfully.\n\n${JSON.stringify(result)}`,
        },
      ],
    };
  }
);
