import { AbsoluteFill, useCurrentFrame } from "remotion";
import { color } from "../theme";

// Soft blush and cream light that drifts slowly behind every scene.
export const Background = () => {
  const frame = useCurrentFrame();
  const drift = (speed: number, range: number, phase = 0) =>
    Math.sin(frame / speed + phase) * range;
  const glow = (x: number, y: number, size: number, tint: string) => (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${tint} 0%, transparent 68%)`,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: color.background, overflow: "hidden" }}>
      {glow(
        1500 + drift(140, 90),
        860 + drift(170, 60, 1),
        1500,
        `${color.blush}99`,
      )}
      {glow(
        260 + drift(160, 80, 2),
        160 + drift(130, 50),
        1300,
        `${color.cream}cc`,
      )}
      {glow(980 + drift(190, 120, 4), 520, 900, "#dcece680")}
    </AbsoluteFill>
  );
};
