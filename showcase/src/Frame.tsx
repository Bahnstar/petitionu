import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { ReactNode } from "react";

export const Frame = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: "#f1f8f7",
        color: "#204c48",
        fontFamily: "Geist, sans-serif",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 78% 65%, #f5cfdc80, transparent 55%), radial-gradient(ellipse at 15% 20%, #f7e8d280, transparent 50%)",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(#204c4806 1px, transparent 1px), linear-gradient(90deg, #204c4806 1px, transparent 1px)",
          backgroundSize: "100px 100px",
          translate: `0 ${frame * 0.3}px`,
          opacity: 0.6,
        }}
      />
      {[0, 1, 2].map((ring) => (
        <div
          key={ring}
          style={{
            position: "absolute",
            width: 1000 + ring * 260,
            height: 1000 + ring * 260,
            left: 960 - (1000 + ring * 260) / 2,
            top: 540 - (1000 + ring * 260) / 2,
            border: "1px solid #204c4812",
            borderRadius: "50%",
            scale: 1 + frame * 0.0006,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 52,
          fontSize: 38,
          fontFamily: "Newsreader, Georgia, serif",
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        PetitionU<span style={{ color: "#204c48", marginLeft: 12 }}>✳</span>
      </div>
      <div
        style={{
          position: "absolute",
          right: 100,
          top: 65,
          fontSize: 17,
          letterSpacing: 4,
          color: "#567269",
        }}
      >
        STUDENT VOICES. AMPLIFIED.
      </div>
      {children}
      <div
        style={{
          position: "absolute",
          left: 100,
          bottom: 28,
          fontSize: 14,
          letterSpacing: 2,
          color: "#567269",
        }}
      >
        PRODUCT PREVIEW / FICTIONAL CAMPUS DATA
      </div>
      <div
        style={{
          position: "absolute",
          right: 100,
          bottom: 34,
          width: 120,
          height: 2,
          background: "#204c48",
          boxShadow: "0 0 18px #204c48",
        }}
      />
    </AbsoluteFill>
  );
};

export const Product = ({
  step,
  title,
  caption,
  src,
  children,
}: {
  step: string;
  title: string;
  caption: string;
  src: string;
  children?: ReactNode;
}) => {
  const frame = useCurrentFrame();
  return (
    <Frame>
      <Interactive.Div
        name="Chapter"
        style={{
          position: "absolute",
          left: 100,
          top: 267,
          fontSize: 18,
          letterSpacing: 2,
          width: 430,
          lineHeight: 1.6,
          color: "#567269",
        }}
      >
        {step}
      </Interactive.Div>
      <Interactive.Div
        name="Scene headline"
        style={{
          position: "absolute",
          left: 96,
          top: 350,
          width: 440,
          fontSize: 88,
          fontFamily: "Newsreader, Georgia, serif",
          fontWeight: 400,
          lineHeight: 1.02,
          letterSpacing: -3,
          opacity: interpolate(frame, [0, 8], [0, 1], {
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [0, 16], [65, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })}px`,
        }}
      >
        {title}
      </Interactive.Div>
      <Interactive.Div
        name="Supporting caption"
        style={{
          position: "absolute",
          left: 103,
          top: 675,
          width: 405,
          lineHeight: 1.5,
          fontSize: 30,
          color: "#567269",
          opacity: interpolate(frame, [8, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {caption}
      </Interactive.Div>
      <Interactive.Div
        name="App capture window"
        style={{
          position: "absolute",
          left: 620,
          top: 180,
          width: 1200,
          height: (1200 * 940) / 1440,
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 0 0 1px #b8cec5, 0 30px 70px #204c481c",
          background: "#f1f7f4",
          scale: interpolate(frame, [0, 20], [0.94, 1], {
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          translate: `0 ${interpolate(frame, [0, 20], [100, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })}px`,
        }}
      >
        <CanvasImage
          src={staticFile(`captures/${src}.png`)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
        {children}
      </Interactive.Div>
    </Frame>
  );
};
