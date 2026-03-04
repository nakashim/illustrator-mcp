import { Jimp, intToRGBA } from "jimp";

import { clamp01 } from "../../core/halftone";

export const readImageBitmap = async (filePath: string) => Jimp.read(filePath);

export const readImageSize = async (filePath: string) => {
  const image = await Jimp.read(filePath);
  return {
    width: image.bitmap.width,
    height: image.bitmap.height,
  };
};

type BitmapSource = {
  bitmap: { width: number; height: number };
  getPixelColor: (x: number, y: number) => number;
};

export const createCellAverageSampler = (image: BitmapSource, grid = 3) => {
  const sampleGrid = Math.max(2, grid);

  return (u: number, v: number, du: number, dv: number) => {
    let sumLuma = 0;
    let sumAlpha = 0;
    let count = 0;

    for (let gy = 0; gy < sampleGrid; gy += 1) {
      for (let gx = 0; gx < sampleGrid; gx += 1) {
        const su = clamp01(u + ((gx / (sampleGrid - 1)) - 0.5) * du);
        const sv = clamp01(v + ((gy / (sampleGrid - 1)) - 0.5) * dv);
        const x = Math.min(
          image.bitmap.width - 1,
          Math.max(0, Math.round(su * (image.bitmap.width - 1)))
        );
        const y = Math.min(
          image.bitmap.height - 1,
          Math.max(0, Math.round(sv * (image.bitmap.height - 1)))
        );
        const rgba = intToRGBA(image.getPixelColor(x, y));
        sumLuma += (0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b) / 255;
        sumAlpha += rgba.a / 255;
        count += 1;
      }
    }

    if (count <= 0) {
      return { luma: 1, alpha: 0 };
    }
    return {
      luma: sumLuma / count,
      alpha: sumAlpha / count,
    };
  };
};

export const createCellAverageRgbaSampler = (image: BitmapSource, grid = 3) => {
  const sampleGrid = Math.max(2, grid);

  return (u: number, v: number, du: number, dv: number) => {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumAlpha = 0;
    let count = 0;

    for (let gy = 0; gy < sampleGrid; gy += 1) {
      for (let gx = 0; gx < sampleGrid; gx += 1) {
        const su = clamp01(u + ((gx / (sampleGrid - 1)) - 0.5) * du);
        const sv = clamp01(v + ((gy / (sampleGrid - 1)) - 0.5) * dv);
        const x = Math.min(
          image.bitmap.width - 1,
          Math.max(0, Math.round(su * (image.bitmap.width - 1)))
        );
        const y = Math.min(
          image.bitmap.height - 1,
          Math.max(0, Math.round(sv * (image.bitmap.height - 1)))
        );
        const rgba = intToRGBA(image.getPixelColor(x, y));
        sumR += rgba.r;
        sumG += rgba.g;
        sumB += rgba.b;
        sumAlpha += rgba.a / 255;
        count += 1;
      }
    }

    if (count <= 0) {
      return { r: 255, g: 255, b: 255, alpha: 0 };
    }
    return {
      r: sumR / count,
      g: sumG / count,
      b: sumB / count,
      alpha: sumAlpha / count,
    };
  };
};
