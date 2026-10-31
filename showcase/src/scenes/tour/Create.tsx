import { AbsoluteFill, useCurrentFrame } from "remotion";
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
import { copy, shots, type Box } from "../../layout";
import {
  enter,
  exit,
  hiddenWhileTyping,
  mix,
  path,
  press,
  ramp,
  SETTLE,
  SOFT,
  typed,
  typingEnds,
} from "../../motion";
import { color, font } from "../../theme";

const empty = shots.create.boxes;
const filled = shots["create-filled"].boxes;
const menu = shots["create-category"].boxes;
const live = shots.published.boxes;

const TITLE_CLICK = 42;
const TITLE_TYPE = 46;
const TITLE_DONE = typingEnds(copy.title, TITLE_TYPE, 0.85);
const CATEGORY_CLICK = TITLE_DONE + 16;
const OPEN = CATEGORY_CLICK + 2;
const OPTION_CLICK = OPEN + 24;
const DESCRIPTION_CLICK = OPTION_CLICK + 18;
const DESCRIPTION_TYPE = DESCRIPTION_CLICK + 4;
const DESCRIPTION_DONE = typingEnds(copy.description, DESCRIPTION_TYPE, 0.3);
const FILLED = DESCRIPTION_DONE + 4;
const PUBLISH_CLICK = FILLED + 30;
const PUBLISHED = PUBLISH_CLICK + 8;

// Character counters under the fields, redrawn so they tick up while typing.
const Counter = ({ box, value }: { box: Box; value: string }) => (
  <>
    <Cover box={{ x: box.x + box.w - 70, y: box.y, w: 72, h: box.h }} />
    <div
      style={{
        position: "absolute",
        left: box.x + box.w - 120,
        top: box.y,
        width: 120,
        textAlign: "right",
        fontFamily: font.sans,
        fontSize: 12,
        lineHeight: `${box.h}px`,
        color: color.muted,
      }}
    >
      {value}
    </div>
  </>
);

const placeholder = (
  field: Box & { style: { paddingLeft: number } },
  height: number,
) => ({
  x: field.x + field.style.paddingLeft - 3,
  y: field.y + 4,
  w: field.w - field.style.paddingLeft - 20,
  h: height,
});

// Write the petition, pick a category from the real menu, publish, and see it go live.
export const Create = () => {
  const frame = useCurrentFrame();
  const camera = path(frame, { x: 720, y: 500, z: 1 }, [
    { at: 10, to: { x: 546, y: 640, z: 1.5 }, dur: 38 },
    { at: FILLED - 4, to: { x: 560, y: 1225, z: 1.4 }, dur: 30 },
  ]);
  const titlePoint = { x: 430, y: empty.title.y + empty.title.h / 2 };
  const categoryPoint = { x: 520, y: empty.category.y + empty.category.h / 2 };
  const optionPoint = { x: 300, y: menu.option.y + menu.option.h / 2 };
  const descriptionPoint = { x: 600, y: empty.description.y + 60 };
  const publishPoint = {
    x: filled.publish.x + filled.publish.w / 2 + 8,
    y: filled.publish.y + filled.publish.h / 2,
  };
  const pointer = path(
    frame,
    { x: 1020, y: 900 },
    [
      { at: 18, to: titlePoint, dur: 24 },
      { at: TITLE_DONE + 2, to: categoryPoint, dur: 14 },
      { at: OPEN + 6, to: optionPoint, dur: 14 },
      { at: OPTION_CLICK + 2, to: descriptionPoint, dur: 14 },
      { at: DESCRIPTION_DONE + 2, to: publishPoint, dur: 26 },
    ],
    28,
    30,
  );
  const title = typed(copy.title, frame, TITLE_TYPE, 0.85);
  const description = typed(copy.description, frame, DESCRIPTION_TYPE, 0.3);
  const menuOpen =
    enter(frame, OPEN, SETTLE, 10) *
    (1 - ramp(frame, OPTION_CLICK + 1, 6, exit));
  const chosen = enter(frame, OPTION_CLICK + 2, SETTLE, 10);
  const blink = Math.floor(frame / 9) % 2 === 0;
  const success = enter(frame, PUBLISHED, SETTLE, 16);
  const panel = enter(frame, PUBLISHED + 6, SOFT);
  return (
    <>
      <PageCanvas
        camera={camera}
        height={shots.create.height}
        overlay={
          <Cursor
            frame={frame}
            at={toScreen(camera, pointer)}
            clicks={[
              TITLE_CLICK,
              CATEGORY_CLICK,
              OPTION_CLICK,
              DESCRIPTION_CLICK,
              PUBLISH_CLICK,
            ]}
            opacity={
              enter(frame, 16) *
              (1 - ramp(frame, PUBLISHED, 8, exit)) *
              hiddenWhileTyping(frame, [
                [TITLE_TYPE + 2, TITLE_DONE + 1],
                [DESCRIPTION_TYPE + 2, DESCRIPTION_DONE + 1],
              ])
            }
          />
        }
      >
        {frame < FILLED ? (
          <>
            <Shot name="create" />
            {frame >= TITLE_CLICK ? (
              <>
                <Cover box={placeholder(empty.title, empty.title.h - 8)} />
                <Typed
                  field={empty.title}
                  text={title}
                  caret={
                    frame < CATEGORY_CLICK && (blink || frame < TITLE_DONE)
                  }
                />
                <Counter box={empty.titleCount} value={`${title.length}/100`} />
              </>
            ) : null}
            <Piece
              name="create-filled"
              box={filled.category}
              radius={22}
              style={{ opacity: chosen }}
            />
            {frame >= DESCRIPTION_CLICK ? (
              <>
                <Cover box={placeholder(empty.description, 32)} />
                <Typed
                  field={empty.description}
                  text={description}
                  caret={blink || frame < DESCRIPTION_DONE}
                  multiline
                />
                <Counter
                  box={empty.descriptionCount}
                  value={`${description.length.toLocaleString("en-US")}/2,000`}
                />
              </>
            ) : null}
            <FocusRing
              box={empty.title}
              radius={22}
              show={
                enter(frame, TITLE_CLICK) * (1 - enter(frame, CATEGORY_CLICK))
              }
            />
            <FocusRing
              box={empty.category}
              radius={22}
              show={
                enter(frame, CATEGORY_CLICK) *
                (1 - enter(frame, DESCRIPTION_CLICK))
              }
            />
            <FocusRing
              box={empty.description}
              radius={14}
              show={
                enter(frame, DESCRIPTION_CLICK) * (1 - enter(frame, FILLED))
              }
            />
            {menuOpen > 0.001 ? (
              <Piece
                name="create-category"
                box={menu.listbox}
                radius={14}
                style={{
                  opacity: menuOpen,
                  translate: `0 ${mix(-8, 0, menuOpen)}px`,
                  scale: `${mix(0.98, 1, menuOpen)}`,
                  transformOrigin: "top center",
                  boxShadow: "0 12px 28px -10px rgba(32, 76, 72, 0.28)",
                }}
              />
            ) : null}
          </>
        ) : (
          <>
            <Shot name="create-filled" />
            <Piece
              name="create-filled"
              box={filled.publish}
              radius={22}
              style={{ scale: `${1 - press(frame, PUBLISH_CLICK) * 0.05}` }}
            />
          </>
        )}
      </PageCanvas>
      {frame >= PUBLISHED ? (
        <AbsoluteFill style={{ opacity: success }}>
          <PageCanvas
            camera={path(frame, { x: 720, y: 330, z: 1.2 }, [
              { at: PUBLISHED, to: { x: 720, y: 310, z: 1.36 }, dur: 70 },
            ])}
            height={shots.published.height}
          >
            <Shot name="published" />
            <Cover box={live.panel} fill={color.background} />
            <Piece
              name="published"
              box={live.panel}
              radius={24}
              style={{
                opacity: panel,
                scale: `${mix(0.92, 1, panel)}`,
                translate: `0 ${mix(30, 0, panel)}px`,
              }}
            />
          </PageCanvas>
        </AbsoluteFill>
      ) : null}
    </>
  );
};
