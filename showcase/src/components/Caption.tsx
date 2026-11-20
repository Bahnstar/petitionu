import { interpolate } from "remotion";
import { enter, exit, mix, ramp, SETTLE, SOFT } from "../motion";
import type { Chapter } from "../timeline";
import { color, font } from "../theme";

export const COLUMN = { left: 110, width: 500 };

// A chapter caption: the label slides in, the headline rises line by line from behind a mask,
// then the supporting line settles. Everything lifts away together before the next chapter.
export const Caption = ({
  frame,
  chapter,
  index,
}: {
  frame: number;
  chapter: Chapter;
  index: number;
}) => {
  const local = frame - chapter.from;
  const out = ramp(frame, chapter.to - 14, 12, exit);
  if (local < 0 || out >= 1) return null;
  const label = enter(local, 0);
  const body = enter(local, 16, SETTLE);
  return (
    <div
      style={{
        position: "absolute",
        left: COLUMN.left,
        top: 300,
        width: COLUMN.width,
        opacity: 1 - out,
        translate: `0 ${-26 * out}px`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: font.sans,
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: 2.6,
          textTransform: "uppercase",
          color: color.muted,
          opacity: label,
          translate: `${mix(-18, 0, label)}px 0`,
        }}
      >
        <span style={{ color: color.rose }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          style={{ width: 28 * label, height: 1.5, background: color.rose }}
        />
        {chapter.label}
      </div>
      <div style={{ marginTop: 26 }}>
        {chapter.title.map((line, lineIndex) => {
          const rise = enter(local, 4 + lineIndex * 5, SOFT);
          return (
            <div
              key={line}
              style={{ overflow: "hidden", paddingBottom: 8, marginBottom: -8 }}
            >
              <div
                style={{
                  fontFamily: font.display,
                  fontSize: 60,
                  lineHeight: 1.04,
                  letterSpacing: -1.8,
                  color:
                    lineIndex === chapter.title.length - 1
                      ? color.rose
                      : color.foreground,
                  translate: `0 ${mix(110, 0, rise)}%`,
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
          marginTop: 30,
          width: 440,
          fontFamily: font.sans,
          fontSize: 25,
          lineHeight: 1.5,
          color: color.muted,
          opacity: body,
          translate: `0 ${mix(16, 0, body)}px`,
        }}
      >
        {chapter.body}
      </div>
    </div>
  );
};

// Where we are in the tour: five chapters, with a rose marker that slides to the current one.
export const ChapterRail = ({
  frame,
  chapters,
  end,
}: {
  frame: number;
  chapters: Chapter[];
  end: number;
}) => {
  const upcoming = chapters.findIndex((chapter) => frame < chapter.to);
  const active = upcoming === -1 ? chapters.length - 1 : upcoming;
  const position = chapters.reduce(
    (sum, chapter, index) =>
      index === 0 ? 0 : sum + enter(frame, chapter.from - 6),
    0,
  );
  const shown = enter(frame, 40) * (1 - ramp(frame, end - 16, 14, exit));
  return (
    <div
      style={{
        position: "absolute",
        left: COLUMN.left,
        top: 832,
        opacity: shown,
        fontFamily: font.sans,
        fontSize: 18,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 13 + position * 34,
          width: 18,
          height: 2,
          background: color.rose,
        }}
      />
      {chapters.map((chapter, index) => (
        <div
          key={chapter.label}
          style={{
            height: 34,
            paddingLeft: 32,
            display: "flex",
            alignItems: "center",
            color: index === active ? color.foreground : color.muted,
            fontWeight: index === active ? 600 : 400,
            opacity:
              index === active
                ? 1
                : interpolate(index < active ? 1 : 0, [0, 1], [0.55, 0.75]),
          }}
        >
          {chapter.label}
        </div>
      ))}
    </div>
  );
};
