export const parseLengthToPt = (value: string): number => {
  const input = value.trim();

  // Feet-and-inches composite notation, e.g. 5' 8" or 5ft 8in.
  const feetInchesMatch = input.match(
    /^([+-]?(?:\d+\.?\d*|\.\d+))\s*(?:ft|')\s*(?:(\d+\.?\d*|\.\d+)\s*(?:in|")?)?$/i
  );
  if (feetInchesMatch) {
    const feetRaw = Number.parseFloat(feetInchesMatch[1]);
    const inchesRaw = Number.parseFloat(feetInchesMatch[2] ?? "0");
    if (!Number.isFinite(feetRaw) || !Number.isFinite(inchesRaw)) {
      return Number.NaN;
    }
    const sign = Math.sign(feetRaw) || 1;
    const totalInches = Math.abs(feetRaw) * 12 + inchesRaw;
    return sign * totalInches * 72;
  }

  // Inch quote notation, e.g. 8".
  const inchesQuoteMatch = input.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*"$/);
  if (inchesQuoteMatch) {
    const inches = Number.parseFloat(inchesQuoteMatch[1]);
    return Number.isFinite(inches) ? inches * 72 : Number.NaN;
  }

  const match = input.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*([a-zA-Z]+)?$/);
  if (!match) {
    return Number.NaN;
  }
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }
  const rawUnit = match[2] ?? "pt";
  const unit = rawUnit.toLowerCase();

  switch (unit) {
    case "pt":
      return amount;
    case "px":
      // Illustrator length handling: treat px equivalent to pt.
      return amount;
    case "pc":
      return amount * 12;
    case "in":
      return amount * 72;
    case "ft":
      return amount * 72 * 12;
    case "yd":
      return amount * 72 * 36;
    case "mm":
      return (amount * 72) / 25.4;
    case "cm":
      return (amount * 72) / 2.54;
    case "m":
      return (amount * 72 * 1000) / 25.4;
    case "q":
    case "h":
      return (amount / 4 / 25.4) * 72;
    default:
      return Number.NaN;
  }
};

export const formatPt = (value: number) => `${value.toFixed(3)}pt`;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const clamp01 = (value: number) => clamp(value, 0, 1);
