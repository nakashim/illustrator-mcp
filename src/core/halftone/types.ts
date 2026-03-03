export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type Dot = {
  x: number;
  y: number;
  r: number;
};

export type HalftoneOptions = {
  dotSpacingPt: number;
  minRadiusPt: number;
  maxRadiusPt: number;
  angleDeg: number;
  maxDots: number;
  invert: boolean;
  contrast: number;
  gamma: number;
  dotScale: number;
  backgroundThreshold: number;
};

export type HalftoneProfile = "light" | "standard" | "quality";
