import { interpolate } from "remotion";
import { press, type Point } from "../motion";
import { color } from "../theme";

// A pointer in viewport pixels. Each click dips the arrow and sends out a rose ring.
export const Cursor = ({
  frame,
  at,
  clicks,
  opacity = 1,
}: {
  frame: number;
  at: Point;
  clicks: number[];
  opacity?: number;
}) => {
  const down = Math.max(0, ...clicks.map((click) => press(frame, click)));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity }}>
      {clicks.map((click) => {
        const t = interpolate(frame, [click, click + 20], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        if (frame < click || t >= 1) return null;
        const size = interpolate(t, [0, 1], [14, 74]);
        return (
          <div
            key={click}
            style={{
              position: "absolute",
              left: at.x - size / 2,
              top: at.y - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              border: `2.5px solid ${color.rose}`,
              opacity: (1 - t) * 0.8,
            }}
          />
        );
      })}
      <svg
        width={34}
        height={40}
        viewBox="0 0 17 20"
        style={{
          position: "absolute",
          left: at.x - 3,
          top: at.y - 2,
          transformOrigin: "3px 2px",
          scale: 1 - down * 0.14,
          filter: "drop-shadow(0 3px 5px rgba(20, 40, 38, 0.3))",
          overflow: "visible",
        }}
      >
        <path
          d="M1.5 1 L1.5 16.2 L5.3 12.6 L8 18.6 L10.6 17.5 L8 11.6 L13.3 11.6 Z"
          fill="#17201f"
          stroke="#ffffff"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
