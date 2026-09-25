import { Interactive, interpolate, useCurrentFrame, Easing } from "remotion";
import { Frame } from "../Frame";
export const Outro = () => {
  const frame = useCurrentFrame();
  return (
    <Frame>
      <div
        style={{
          position: "absolute",
          top: 218,
          width: "100%",
          textAlign: "center",
          fontSize: 22,
          letterSpacing: 7,
          color: "#204c48",
        }}
      >
        FROM ONE VOICE TO ALL OF US
      </div>
      <Interactive.Div
        name="Closing headline"
        style={{
          position: "absolute",
          left: 100,
          top: 306,
          width: 1720,
          fontSize: 152,
          fontFamily: "Newsreader, Georgia, serif",
          fontWeight: 400,
          lineHeight: 1.04,
          letterSpacing: -7,
          textAlign: "center",
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, 22], [0.85, 1], {
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        Small ask.
        <br />
        <span style={{ color: "#a67076", fontStyle: "italic" }}>
          Big possibility.
        </span>
      </Interactive.Div>
      <Interactive.Div
        name="Call to action"
        style={{
          position: "absolute",
          left: 620,
          top: 720,
          width: 680,
          padding: "26px 0",
          textAlign: "center",
          background: "#204c48",
          borderRadius: 60,
          color: "#ffffff",
          boxShadow: "0 0 70px #204c4833",
          fontSize: 36,
          fontWeight: 700,
          opacity: interpolate(frame, [18, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [18, 32], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
        }}
      >
        Start with your idea ↗
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          top: 886,
          width: "100%",
          textAlign: "center",
          fontSize: 26,
          color: "#567269",
        }}
      >
        PetitionU · A place for student voices.
      </div>
    </Frame>
  );
};
