import { Interactive, interpolate, useCurrentFrame, Easing } from "remotion";
import { Frame } from "../Frame";
export const Intro = () => {
  const frame = useCurrentFrame();
  return (
    <Frame>
      <div
        style={{
          position: "absolute",
          top: 213,
          width: "100%",
          textAlign: "center",
          fontSize: 22,
          letterSpacing: 8,
          color: "#204c48",
        }}
      >
        THE NEXT MOVE IS YOURS
      </div>
      {["Your campus.", "Your say."].map((line, index) => (
        <Interactive.Div
          key={line}
          name={`Opening title ${index + 1}`}
          style={{
            position: "absolute",
            top: 290 + index * 192,
            width: "100%",
            textAlign: "center",
            fontSize: 190,
            fontFamily: "Newsreader, Georgia, serif",
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: -10,
            color: index === 1 ? "#a67076" : "#204c48",
            fontStyle: index === 1 ? "italic" : "normal",
            opacity: interpolate(frame, [index * 9, index * 9 + 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [index * 9, index * 9 + 18], [100, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })}px`,
            scale: interpolate(frame, [0, 90], [1, 1.045]),
          }}
        >
          {line}
        </Interactive.Div>
      ))}
      <Interactive.Div
        name="Opening caption"
        style={{
          position: "absolute",
          top: 760,
          width: "100%",
          textAlign: "center",
          fontSize: 34,
          color: "#567269",
          opacity: interpolate(frame, [23, 33], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        One idea. A campus behind it.
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 560,
          top: 875,
          width: 800,
          height: 2,
          background:
            "linear-gradient(90deg, transparent, #204c48, #a67076, transparent)",
          scale: interpolate(frame, [0, 35], [0, 1], {
            extrapolateRight: "clamp",
          }),
          boxShadow: "0 0 35px #204c48",
        }}
      />
    </Frame>
  );
};
