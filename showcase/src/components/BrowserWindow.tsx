import type { ReactNode } from "react";
import { interpolate } from "remotion";
import { enter, ramp } from "../motion";
import { color, font } from "../theme";
import { VIEWPORT } from "./Page";

export const CHROME_HEIGHT = 52;

// A quiet browser frame. The title pill tracks the page, and a rose bar runs across the top
// each time a new page loads.
export const BrowserWindow = ({
  frame,
  pages,
  children,
}: {
  frame: number;
  pages: { from: number; title: string }[];
  children: ReactNode;
}) => {
  const current = pages.filter((page) => page.from <= frame).pop() ?? pages[0];
  const arrived = enter(frame, current.from + 4);
  const loading = ramp(frame, current.from, 20);
  return (
    <div
      style={{
        width: VIEWPORT.width,
        height: VIEWPORT.height + CHROME_HEIGHT,
        borderRadius: 22,
        overflow: "hidden",
        background: color.white,
        boxShadow:
          "0 0 0 1px rgba(32, 76, 72, 0.09), 0 30px 60px -20px rgba(32, 76, 72, 0.28), 0 80px 120px -60px rgba(32, 76, 72, 0.35)",
      }}
    >
      <div
        style={{
          position: "relative",
          height: CHROME_HEIGHT,
          borderBottom: `1px solid ${color.border}`,
          display: "flex",
          alignItems: "center",
          paddingLeft: 22,
          gap: 8,
        }}
      >
        {["#ecc9d2", "#f0dcc0", "#cfe2db"].map((dot) => (
          <div
            key={dot}
            style={{ width: 12, height: 12, borderRadius: 6, background: dot }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 10,
            translate: "-50% 0",
            height: 32,
            minWidth: 420,
            padding: "0 22px",
            borderRadius: 16,
            background: color.background,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.sans,
            fontSize: 15,
            color: color.muted,
          }}
        >
          <span
            style={{
              opacity: arrived,
              translate: `0 ${interpolate(arrived, [0, 1], [10, 0])}px`,
            }}
          >
            {current.title}
          </span>
        </div>
      </div>
      <div
        style={{
          position: "relative",
          width: VIEWPORT.width,
          height: VIEWPORT.height,
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: 3,
            width: `${loading * 100}%`,
            background: color.rose,
            opacity: interpolate(
              frame,
              [current.from + 18, current.from + 28],
              [1, 0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            ),
          }}
        />
      </div>
    </div>
  );
};
