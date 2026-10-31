import data from "./layout.json";

// Written by scripts/capture.mjs: page coordinates (CSS pixels) of everything the video
// points at, types into, or redraws, measured on the same pages as the screenshots.
export type Box = { x: number; y: number; w: number; h: number };
export type FieldStyle = {
  paddingLeft: number;
  paddingTop: number;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
};
export type Field = Box & { style: FieldStyle };

type Captures = typeof data.captures;
export type CaptureName = keyof Captures;

export const copy = data.copy;
export const shots = data.captures;
export const PAGE_WIDTH = 1440;

export const center = (box: Box) => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
});
