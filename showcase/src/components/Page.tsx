import { AbsoluteFill, Img, staticFile } from "remotion";
import type { CSSProperties, ReactNode } from "react";
import {
  PAGE_WIDTH,
  shots,
  type Box,
  type CaptureName,
  type Field,
} from "../layout";
import type { Camera, Point } from "../motion";
import { color, font } from "../theme";

// The browser viewport inside the window, and how page pixels map onto it.
export const VIEWPORT = { width: 1180, height: 806 };
export const SCALE = VIEWPORT.width / PAGE_WIDTH;

export const toScreen = (camera: Camera, point: Point): Point => ({
  x: VIEWPORT.width / 2 + (point.x - camera.x) * SCALE * camera.z,
  y: VIEWPORT.height / 2 + (point.y - camera.y) * SCALE * camera.z,
});

const source = (name: CaptureName) => staticFile(`captures/${name}.png`);

// A whole capture, laid out in page coordinates.
export const Shot = ({
  name,
  style,
}: {
  name: CaptureName;
  style?: CSSProperties;
}) => (
  <Img
    src={source(name)}
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: PAGE_WIDTH,
      height: shots[name].height,
      maxWidth: "none",
      ...style,
    }}
  />
);

// A rectangle cut from a capture. It sits where it was captured unless `style` moves it.
export const Piece = ({
  name,
  box,
  style,
  radius = 0,
}: {
  name: CaptureName;
  box: Box;
  style?: CSSProperties;
  radius?: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      overflow: "hidden",
      borderRadius: radius,
      ...style,
    }}
  >
    <Img
      src={source(name)}
      style={{
        position: "absolute",
        left: -box.x,
        top: -box.y,
        width: PAGE_WIDTH,
        height: shots[name].height,
        maxWidth: "none",
      }}
    />
  </div>
);

// Paints over part of a capture so the video can redraw or reveal it.
export const Cover = ({
  box,
  fill = color.white,
  radius = 0,
  style,
}: {
  box: Box;
  fill?: string;
  radius?: number;
  style?: CSSProperties;
}) => (
  <div
    style={{
      position: "absolute",
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      background: fill,
      borderRadius: radius,
      ...style,
    }}
  />
);

// Text typed into a captured field, in the field's own measured type.
export const Typed = ({
  field,
  text,
  caret,
  multiline = false,
}: {
  field: Field;
  text: string;
  caret: boolean;
  multiline?: boolean;
}) => {
  const { style } = field;
  return (
    <div
      style={{
        position: "absolute",
        left: field.x + style.paddingLeft,
        top: multiline
          ? field.y + style.paddingTop
          : field.y + (field.h - style.lineHeight) / 2,
        width: field.w - style.paddingLeft * 2,
        fontFamily: font.sans,
        fontSize: style.fontSize,
        lineHeight: `${style.lineHeight}px`,
        letterSpacing: style.letterSpacing,
        color: color.foreground,
        whiteSpace: multiline ? "pre-wrap" : "pre",
      }}
    >
      {text}
      <span
        style={{
          display: "inline-block",
          width: 1.5,
          height: style.fontSize * 1.2,
          marginLeft: 1,
          verticalAlign: "middle",
          background: color.foreground,
          opacity: caret ? 1 : 0,
        }}
      />
    </div>
  );
};

// The app's focus treatment: a forest ring with a soft halo.
export const FocusRing = ({
  box,
  radius,
  show,
}: {
  box: Box;
  radius: number;
  show: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      borderRadius: radius,
      boxShadow: `0 0 0 1.5px ${color.foreground}, 0 0 0 ${1.5 + 3 * show}px rgba(32, 76, 72, 0.16)`,
      opacity: show,
    }}
  />
);

export const PageCanvas = ({
  camera,
  height,
  children,
  overlay,
}: {
  camera: Camera;
  height: number;
  children: ReactNode;
  overlay?: ReactNode;
}) => {
  const zoom = SCALE * camera.z;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: color.background }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: PAGE_WIDTH,
          height,
          transformOrigin: "0 0",
          transform: `translate(${VIEWPORT.width / 2 - camera.x * zoom}px, ${VIEWPORT.height / 2 - camera.y * zoom}px) scale(${zoom})`,
        }}
      >
        {children}
      </div>
      {overlay}
    </AbsoluteFill>
  );
};
