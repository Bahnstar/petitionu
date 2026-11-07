import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Cursor } from "../components/Cursor";
import { Logo } from "../components/Logo";
import { enter, mix, path, press, SETTLE, SNAP, SOFT } from "../motion";
import { color, font } from "../theme";

const CLICK = 104;

// The app's own promise, and the one thing to do next.
export const Close = () => {
  const frame = useCurrentFrame();
  const logo = enter(frame, 30, SETTLE);
  const sub = enter(frame, 34, SETTLE);
  const cta = enter(frame, 46, SNAP);
  const note = enter(frame, 58, SETTLE);
  const pressed = press(frame, CLICK);
  const after = enter(frame, CLICK + 2, SETTLE);
  const pointer = path(
    frame,
    { x: 1560, y: 1140 },
    [{ at: 66, to: { x: 1010, y: 822 }, dur: 32 }],
    28,
    50,
  );
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 96,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          opacity: logo,
        }}
      >
        <Logo size={44} spin={mix(-90, 0, logo)} />
      </div>
      <div style={{ position: "absolute", top: 236, width: "100%" }}>
        {["Your campus.", "Your say."].map((line, index) => {
          const rise = enter(frame, 8 + index * 7, SOFT);
          return (
            <div
              key={line}
              style={{
                overflow: "hidden",
                paddingBottom: 30,
                marginBottom: -30,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: font.display,
                  fontSize: 176,
                  lineHeight: 1,
                  letterSpacing: -6,
                  color: index === 1 ? color.rose : color.foreground,
                  translate: `0 ${mix(115, 0, rise)}%`,
                }}
              >
                {line}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          top: 640,
          width: "100%",
          textAlign: "center",
          fontFamily: font.sans,
          fontSize: 34,
          color: color.muted,
          opacity: sub,
          translate: `0 ${mix(18, 0, sub)}px`,
        }}
      >
        Start the petition you keep talking about.
      </div>
      <div
        style={{
          position: "absolute",
          top: 760,
          width: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "26px 48px",
            borderRadius: 999,
            background: color.foreground,
            color: color.white,
            fontFamily: font.sans,
            fontSize: 32,
            fontWeight: 600,
            opacity: Math.min(1, cta * 1.4),
            scale: `${mix(0.85, 1, cta) * (1 - pressed * 0.05)}`,
            boxShadow: `0 24px 50px -22px rgba(32, 76, 72, 0.6), 0 0 0 ${10 * after}px rgba(166, 112, 118, ${0.18 * (1 - after * 0.4)})`,
          }}
        >
          Start a petition
          <svg
            width={30}
            height={30}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 902,
          width: "100%",
          textAlign: "center",
          fontFamily: font.sans,
          fontSize: 24,
          color: color.muted,
          opacity: note * 0.9,
        }}
      >
        Sign in with your school email.
      </div>
      <Cursor
        frame={frame}
        at={pointer}
        clicks={[CLICK]}
        opacity={enter(frame, 64)}
      />
    </AbsoluteFill>
  );
};
