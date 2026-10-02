import { useCurrentFrame } from "remotion";
import { Cursor } from "../../components/Cursor";
import {
  Cover,
  FocusRing,
  PageCanvas,
  Piece,
  Shot,
  toScreen,
  Typed,
} from "../../components/Page";
import { copy, shots } from "../../layout";
import {
  enter,
  hiddenWhileTyping,
  mix,
  path,
  press,
  ramp,
  SETTLE,
  typed,
  typingEnds,
} from "../../motion";
import { color } from "../../theme";

const all = shots.browse.boxes;
const found = shots["browse-search"].boxes;
const SEARCH_CLICK = 70;
const TYPE_START = 74;
const TYPED = typingEnds(copy.search, TYPE_START, 2.6);
const NARROW = TYPED + 6;
const OPEN_CLICK = 166;
// Cards that match the search keep their place; the rest drop away.
const KEPT = 2;
const SHIFT = found.library.y - all.library.y;

// The campus feed loads, a student searches for "library", and opens the petition.
export const Browse = () => {
  const frame = useCurrentFrame();
  const camera = path(frame, { x: 720, y: 520, z: 1 }, [
    { at: 40, to: { x: 600, y: 440, z: 1.3 }, dur: 40 },
    { at: 128, to: { x: 430, y: 560, z: 1.6 }, dur: 36 },
  ]);
  const searchPoint = { x: 340, y: all.search.y + all.search.h / 2 };
  const openPoint = { x: found.library.x + 230, y: found.library.y + 92 };
  const pointer = path(
    frame,
    { x: 1180, y: 900 },
    [
      { at: 42, to: searchPoint, dur: 26 },
      { at: 124, to: openPoint, dur: 26 },
    ],
    28,
    40,
  );
  const focus =
    enter(frame, SEARCH_CLICK) * (1 - enter(frame, OPEN_CLICK - 20));
  const narrowed = ramp(frame, NARROW + 4, 12);
  const hover = enter(frame, 148);
  const placeholder = {
    x: all.search.x + all.search.style.paddingLeft - 3,
    y: all.search.y + 8,
    w: 360,
    h: all.search.h - 16,
  };
  return (
    <PageCanvas
      camera={camera}
      height={shots.browse.height}
      overlay={
        <Cursor
          frame={frame}
          at={toScreen(camera, pointer)}
          clicks={[SEARCH_CLICK, OPEN_CLICK]}
          opacity={
            enter(frame, 30) *
            hiddenWhileTyping(frame, [[TYPE_START + 2, TYPED + 2]])
          }
        />
      }
    >
      <Shot name="browse" />
      {frame >= SEARCH_CLICK ? (
        <>
          <Cover box={placeholder} />
          <Typed
            field={all.search}
            text={typed(copy.search, frame, TYPE_START, 2.6)}
            caret={frame < TYPED + 4 || Math.floor(frame / 9) % 2 === 0}
          />
        </>
      ) : null}
      <Shot name="browse-search" style={{ opacity: narrowed }} />
      {[...all.cards, found.library].map((card, index) => (
        <Cover key={index} box={card} fill={color.background} />
      ))}
      {all.cards.map((card, index) => {
        const arrive = enter(frame, 14 + index * 4, SETTLE);
        const leave =
          index < KEPT ? 0 : enter(frame, NARROW + (index - KEPT) * 3, SETTLE);
        const settle = index < KEPT ? enter(frame, NARROW + 8, SETTLE) : 0;
        const lifted = index === 0 ? hover : 0;
        const clicked = index === 0 ? press(frame, OPEN_CLICK) : 0;
        if (leave >= 0.999) return null;
        return (
          <Piece
            key={index}
            name="browse"
            box={card}
            radius={20}
            style={{
              opacity: arrive * (1 - leave),
              translate: `0 ${mix(40, 0, arrive) + SHIFT * settle + 26 * leave - 6 * lifted}px`,
              scale: `${mix(0.96, 1, arrive) * (1 - 0.06 * leave) * (1 - 0.015 * clicked)}`,
              boxShadow: `0 ${22 * lifted}px ${40 * lifted}px -20px rgba(32, 76, 72, ${0.45 * lifted})`,
            }}
          />
        );
      })}
      <FocusRing box={all.search} radius={all.search.h / 2} show={focus} />
    </PageCanvas>
  );
};
