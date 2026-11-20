import { AbsoluteFill, useCurrentFrame } from "remotion";
import { enter, exit, mix, ramp, SNAP, SOFT } from "../motion";
import { color, font } from "../theme";

// The everyday ideas the tour later turns into petitions.
const MESSAGES = [
  {
    name: "Riley",
    text: "library closes at 10. during finals??",
    x: 1090,
    y: 196,
    tilt: -2.2,
  },
  {
    name: "Sam",
    text: "can we get a cheaper lunch option",
    x: 1250,
    y: 372,
    tilt: 1.6,
  },
  {
    name: "Avery",
    text: "no refill station in the arts building",
    x: 1040,
    y: 548,
    tilt: -1.2,
  },
  {
    name: "Jordan",
    text: "someone should email the dean",
    x: 1210,
    y: 724,
    tilt: 2,
  },
];
const LOST = 84;
const SECOND = 98;

const Lines = ({
  frame,
  lines,
  start,
  size,
  align = "left",
}: {
  frame: number;
  lines: string[];
  start: number;
  size: number;
  align?: "left" | "center";
}) => (
  <>
    {lines.map((line, index) => {
      const rise = enter(frame, start + index * 6, SOFT);
      return (
        <div
          key={line}
          style={{
            overflow: "hidden",
            paddingBottom: size * 0.16,
            marginBottom: -size * 0.16,
            textAlign: align,
          }}
        >
          <div
            style={{
              fontFamily: font.display,
              fontSize: size,
              lineHeight: 1.02,
              letterSpacing: -size * 0.03,
              color: index === lines.length - 1 ? color.rose : color.foreground,
              translate: `0 ${mix(115, 0, rise)}%`,
            }}
          >
            {line}
          </div>
        </div>
      );
    })}
  </>
);

// Ideas pile up in a group chat, then scroll away unanswered.
export const Problem = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const firstOut = ramp(frame, LOST, 14, exit);
  const secondOut = ramp(frame, duration - 16, 14, exit);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 372,
          width: 960,
          opacity: 1 - firstOut,
          translate: `0 ${-40 * firstOut}px`,
        }}
      >
        <Lines
          frame={frame}
          lines={["Every campus has a list", "of things to fix."]}
          start={4}
          size={100}
        />
      </div>
      {MESSAGES.map((message, index) => {
        const pop = enter(frame, 16 + index * 9, SNAP);
        const gone = ramp(frame, LOST - 6 + index * 3, 26, exit);
        const bob = Math.sin(frame / 20 + index * 1.7) * 4;
        if (frame < 16 + index * 9) return null;
        return (
          <div
            key={message.text}
            style={{
              position: "absolute",
              left: message.x,
              top: message.y,
              opacity: Math.min(1, pop * 1.5) * (1 - gone),
              translate: `0 ${mix(34, 0, pop) + bob - 300 * gone}px`,
              scale: `${mix(0.75, 1, pop) * mix(1, 0.92, gone)}`,
              rotate: `${message.tilt}deg`,
              filter: `blur(${gone * 8}px)`,
              transformOrigin: "left bottom",
            }}
          >
            <div
              style={{
                fontFamily: font.sans,
                fontSize: 18,
                color: color.muted,
                marginBottom: 8,
                marginLeft: 6,
              }}
            >
              {message.name}
            </div>
            <div
              style={{
                padding: "20px 28px",
                borderRadius: "26px 26px 26px 8px",
                background: color.white,
                fontFamily: font.sans,
                fontSize: 30,
                color: color.foreground,
                whiteSpace: "nowrap",
                boxShadow:
                  "0 0 0 1px rgba(32, 76, 72, 0.07), 0 18px 40px -22px rgba(32, 76, 72, 0.45)",
              }}
            >
              {message.text}
            </div>
          </div>
        );
      })}
      {frame >= SECOND ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 380,
            width: 1920,
            opacity: 1 - secondOut,
            translate: `0 ${-40 * secondOut}px`,
          }}
        >
          <Lines
            frame={frame}
            lines={["Most of it never leaves", "the group chat."]}
            start={SECOND}
            size={116}
            align="center"
          />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
