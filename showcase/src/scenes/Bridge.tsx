import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Logo } from "../components/Logo";
import { enter, exit, mix, ramp, SETTLE, SOFT } from "../motion";
import { color, font } from "../theme";

// The brand answers the problem, then rises out of the way of the product.
export const Bridge = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const logo = enter(frame, 2, SOFT);
  const line = enter(frame, 14, SETTLE);
  const away = ramp(frame, duration - 40, 24, exit);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        opacity: 1 - away,
        translate: `0 ${-220 * away}px`,
      }}
    >
      <div style={{ opacity: logo, scale: `${mix(0.88, 1, logo)}` }}>
        <Logo size={150} spin={mix(-120, 0, logo)} />
      </div>
      <div
        style={{
          marginTop: 34,
          fontFamily: font.sans,
          fontSize: 38,
          color: color.muted,
          opacity: line,
          translate: `0 ${mix(18, 0, line)}px`,
        }}
      >
        gives those ideas somewhere to go.
      </div>
    </AbsoluteFill>
  );
};
