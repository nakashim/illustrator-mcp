export const parseLengthToPt = (value: string): number => {
  const input = value.trim();
  if (input.endsWith("mm")) {
    return (parseFloat(input.slice(0, -2)) * 72) / 25.4;
  }
  if (input.endsWith("Q")) {
    return (parseFloat(input.slice(0, -1)) / 4 / 25.4) * 72;
  }
  if (input.endsWith("pt")) {
    return parseFloat(input.slice(0, -2));
  }
  return parseFloat(input);
};

export const formatPt = (value: number) => `${value.toFixed(3)}pt`;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const clamp01 = (value: number) => clamp(value, 0, 1);
