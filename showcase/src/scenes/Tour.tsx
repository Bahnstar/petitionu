import type { ReactNode } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { BrowserWindow } from "../components/BrowserWindow";
import { Caption, ChapterRail, COLUMN } from "../components/Caption";
import { Logo } from "../components/Logo";
import { enter, exit, mix, ramp, SETTLE, SOFT } from "../motion";
import { CHAPTERS, PAGES } from "../timeline";
import { color, font } from "../theme";
import { Browse } from "./tour/Browse";
import { Classroom } from "./tour/Classroom";
import { Create } from "./tour/Create";
import { Petition } from "./tour/Petition";

const SCREENS = {
  browse: Browse,
  petition: Petition,
  create: Create,
  classroom: Classroom,
};

// Each new page loads over the last one: it fades up from slightly below.
const Arrive = ({
  children,
  instant,
}: {
  children: ReactNode;
  instant: boolean;
}) => {
  const frame = useCurrentFrame();
  const shown = instant ? 1 : enter(frame, 0, SETTLE, 10);
  return (
    <AbsoluteFill
      style={{ opacity: shown, translate: `0 ${mix(18, 0, shown)}px` }}
    >
      {children}
    </AbsoluteFill>
  );
};

// One continuous browser session beside chapter captions.
export const Tour = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const rise = enter(frame, 0, SOFT);
  const leave = ramp(frame, duration - 52, 32, exit);
  const chrome = enter(frame, 20) * (1 - leave);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: COLUMN.left,
          top: 72,
          opacity: chrome,
        }}
      >
        <Logo size={40} />
      </div>
      {CHAPTERS.map((chapter, index) => (
        <Caption
          key={chapter.label}
          frame={frame}
          chapter={chapter}
          index={index}
        />
      ))}
      <ChapterRail frame={frame} chapters={CHAPTERS} end={duration - 24} />
      <div
        style={{
          position: "absolute",
          left: COLUMN.left,
          bottom: 40,
          fontFamily: font.sans,
          fontSize: 14,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: color.muted,
          opacity: 0.7 * chrome,
        }}
      >
        Real product screens · Fictional campus
      </div>
      <div
        style={{
          position: "absolute",
          left: 676,
          top: 111,
          perspective: 2400,
        }}
      >
        <div
          style={{
            translate: `0 ${mix(760, 0, rise) + 1150 * leave}px`,
            scale: `${mix(0.9, 1, rise) * mix(1, 0.9, leave)}`,
            rotate: `x ${mix(16, 0, rise) - 10 * leave}deg`,
            transformOrigin: "50% 0%",
          }}
        >
          <BrowserWindow frame={frame} pages={Object.values(PAGES)}>
            {(Object.keys(PAGES) as (keyof typeof PAGES)[]).map(
              (key, index) => {
                const page = PAGES[key];
                const Screen = SCREENS[key];
                return (
                  <Sequence
                    key={key}
                    name={page.title}
                    from={page.from}
                    durationInFrames={page.to - page.from}
                  >
                    <Arrive instant={index === 0}>
                      <Screen />
                    </Arrive>
                  </Sequence>
                );
              },
            )}
          </BrowserWindow>
        </div>
      </div>
    </AbsoluteFill>
  );
};
