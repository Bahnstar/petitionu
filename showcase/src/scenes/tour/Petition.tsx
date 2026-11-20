import { interpolate, useCurrentFrame } from "remotion";
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
  SNAP,
  typed,
  typingEnds,
} from "../../motion";
import { color, font } from "../../theme";

const before = shots.petition.boxes;
const after = shots["petition-signed"].boxes;
const posted = shots["petition-commented"].boxes;

// Cues, in frames from when the page opens.
const MARKS = 8;
const REASON_CLICK = 64;
const REASON_TYPE = 68;
const REASON_DONE = typingEnds(copy.reason, REASON_TYPE, 1.05);
const SIGN_CLICK = REASON_DONE + 20;
const SIGNED = SIGN_CLICK + 4;
const TO_REASONS = SIGNED + 30;
const QUOTE = TO_REASONS + 22;
const TO_COMMENTS = 236;
const COMMENT_CLICK = 262;
const COMMENT_TYPE = 266;
const COMMENT_DONE = typingEnds(copy.comment, COMMENT_TYPE, 0.95);
const POST_CLICK = COMMENT_DONE + 16;
const POSTED = POST_CLICK + 4;
const NEW_COMMENT = POSTED + 30;

// The inside of the reason field, clear of its border and resize handle.
const reasonField = {
  x: before.reason.x + 6,
  y: before.reason.y + 4,
  w: before.reason.w - 22,
  h: before.reason.h - 18,
};

// Signing: the goal is drawn as 100 marks. 42 of 60 fills 70; the student's signature makes
// it 43 and 72, and their own mark turns rose.
const GOAL = 60;
const filledBefore = Math.round((42 / GOAL) * 100);
const filledAfter = Math.round((43 / GOAL) * 100);
const MARK = before.mark.w;
const GAP = (before.marks.w - MARK * 20) / 19;

const Marks = ({ frame }: { frame: number }) => (
  <>
    <Cover box={before.marks} />
    {Array.from({ length: 100 }, (_, index) => {
      const x = before.marks.x + (index % 20) * (MARK + GAP);
      const y = before.marks.y + Math.floor(index / 20) * (MARK + GAP);
      const fill =
        index < filledBefore
          ? enter(frame, MARKS + index * 0.42, SETTLE, 14)
          : index < filledAfter - 1
            ? enter(frame, SIGNED + 6)
            : index === filledAfter - 1
              ? enter(frame, SIGNED + 12, SNAP)
              : 0;
      const yours = index === filledAfter - 1;
      const ring = yours ? ramp(frame, SIGNED + 14, 24) : 0;
      return (
        <div
          key={index}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: MARK,
            height: MARK,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 2,
              background: color.secondary,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 2,
              background: yours ? color.rose : color.foreground,
              opacity: Math.min(1, fill * 1.4),
              scale: `${yours ? mix(0.2, 1, fill) : mix(0.5, 1, fill)}`,
            }}
          />
          {yours && ring > 0 && ring < 1 ? (
            <div
              style={{
                position: "absolute",
                inset: -14 * ring,
                borderRadius: 4 + 10 * ring,
                border: `1.5px solid ${color.rose}`,
                opacity: 1 - ring,
              }}
            />
          ) : null}
        </div>
      );
    })}
  </>
);

// The big tally number: counts up as the page loads, then the last digit rolls 2 → 3.
const Count = ({ frame }: { frame: number }) => {
  const loaded = Math.round(
    42 * ramp(frame, MARKS, 34, (t) => 1 - Math.pow(1 - t, 3)),
  );
  const roll = enter(frame, SIGNED + 4, SETTLE);
  const style = {
    fontFamily: font.display,
    fontSize: 60,
    lineHeight: 0.9,
    letterSpacing: -2.4,
    color: color.foreground,
    fontVariantNumeric: "tabular-nums" as const,
  };
  return (
    <>
      <Cover box={{ ...before.count, w: before.count.w + 4 }} />
      <div
        style={{
          position: "absolute",
          left: before.count.x,
          top: before.count.y,
          display: "flex",
          ...style,
        }}
      >
        {frame < SIGNED ? (
          loaded
        ) : (
          <>
            4
            <div style={{ height: before.count.h, overflow: "hidden" }}>
              <div style={{ translate: `0 ${-before.count.h * roll}px` }}>
                <div style={{ height: before.count.h }}>2</div>
                <div style={{ height: before.count.h }}>3</div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

const Heading = ({ frame }: { frame: number }) => {
  const swap = enter(frame, SIGNED + 2, SETTLE);
  const line = (text: string, offset: number, opacity: number) => (
    <div style={{ position: "absolute", top: offset, height: 20, opacity }}>
      {text}
    </div>
  );
  return (
    <>
      <Cover box={before.heading} />
      <div
        style={{
          position: "absolute",
          left: before.heading.x,
          top: before.heading.y,
          width: before.heading.w,
          height: before.heading.h,
          overflow: "hidden",
          fontFamily: font.sans,
          fontSize: 14,
          lineHeight: "20px",
          fontWeight: 500,
          color: color.foreground,
        }}
      >
        {line("Add your voice.", -20 * swap, 1 - swap)}
        {line("You're part of this.", 20 * (1 - swap), swap)}
      </div>
    </>
  );
};

// The signature panel shrinks from the form to the thank-you note.
const Morph = ({ frame }: { frame: number }) => {
  const shrink = enter(frame, SIGNED, SETTLE);
  const swap = enter(frame, SIGNED + 4, SETTLE);
  const fade = 1 - Math.min(1, enter(frame, SIGNED, SETTLE, 8) * 1.2);
  const height = mix(before.tally.h, after.tally.h, shrink);
  const top = before.form.y;
  const formRoom = before.tally.y + height - top;
  return (
    <>
      <Cover box={{ x: 916, y: 186, w: 386, h: 620 }} fill={color.background} />
      <div
        style={{
          position: "absolute",
          left: before.tally.x,
          top: before.tally.y,
          width: before.tally.w,
          height,
          borderRadius: 20,
          background: color.white,
          boxShadow: `inset 0 0 0 1px ${color.border}`,
        }}
      />
      <Piece
        name="petition-signed"
        box={{ ...after.tally, h: top - after.tally.y }}
        radius={20}
      />
      <Piece
        name="petition"
        box={{
          x: before.tally.x + 1,
          y: top,
          w: before.tally.w - 2,
          h: Math.max(0, formRoom - 1),
        }}
        style={{ opacity: fade }}
      />
      <div style={{ opacity: fade }}>
        <Cover box={reasonField} />
        <Typed
          field={before.reason}
          text={copy.reason}
          caret={false}
          multiline
        />
      </div>
      <Piece
        name="petition-signed"
        box={{
          x: after.tally.x + 1,
          y: top,
          w: after.tally.w - 2,
          h: after.form.h,
        }}
        style={{ opacity: swap, translate: `0 ${mix(12, 0, swap)}px` }}
      />
      <Piece
        name="petition"
        box={before.share}
        style={{
          top:
            before.tally.y +
            height +
            (before.share.y - before.tally.y - before.tally.h),
        }}
      />
    </>
  );
};

const PrimaryButton = ({
  box,
  label,
  pressed,
}: {
  box: Box;
  label: string;
  pressed: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      borderRadius: box.h / 2,
      background: color.foreground,
      color: color.white,
      fontFamily: font.sans,
      fontSize: 14,
      fontWeight: 500,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      scale: `${1 - pressed * 0.05}`,
    }}
  >
    {label}
  </div>
);

// Sign with a reason, see the reason join the petition, then add to the conversation.
export const Petition = () => {
  const frame = useCurrentFrame();
  const camera = path(frame, { x: 720, y: 500, z: 1 }, [
    { at: 20, to: { x: 1108, y: 468, z: 1.8 }, dur: 42 },
    { at: TO_REASONS, to: { x: 520, y: 930, z: 1.65 }, dur: 36 },
    { at: TO_COMMENTS, to: { x: 508, y: 1290, z: 1.5 }, dur: 32 },
    { at: POSTED + 8, to: { x: 508, y: 1690, z: 1.45 }, dur: 36 },
  ]);
  const reasonPoint = { x: 1050, y: before.reason.y + 24 };
  const signPoint = { x: 1120, y: before.sign.y + before.sign.h / 2 };
  const commentPoint = { x: 420, y: after.comment.y + 22 };
  const postPoint = {
    x: after.post.x + after.post.w / 2 + 6,
    y: after.post.y + after.post.h / 2,
  };
  const pointer = path(
    frame,
    { x: 1250, y: 720 },
    [
      { at: 38, to: reasonPoint, dur: 24 },
      { at: REASON_DONE + 2, to: signPoint, dur: 16 },
      { at: TO_COMMENTS, to: { x: 760, y: 1480 }, dur: 1 },
      { at: TO_COMMENTS + 6, to: commentPoint, dur: 22 },
      { at: COMMENT_DONE + 2, to: postPoint, dur: 14 },
    ],
    28,
    30,
  );
  const shown =
    enter(frame, 20) * (1 - ramp(frame, SIGNED + 14, 10, exit)) +
    enter(frame, TO_COMMENTS + 4) * (1 - ramp(frame, POSTED + 12, 10, exit));
  const base =
    frame < SIGNED
      ? "petition"
      : frame < POSTED
        ? "petition-signed"
        : "petition-commented";
  const commentText = typed(copy.comment, frame, COMMENT_TYPE, 0.95);
  const shift = enter(frame, POSTED + 2, SETTLE);
  const newComment = enter(frame, NEW_COMMENT, SETTLE);
  const quote = enter(frame, QUOTE, SETTLE);
  const lift = posted.thread.y - after.thread.y;
  return (
    <PageCanvas
      camera={camera}
      height={shots[base].height}
      overlay={
        <Cursor
          frame={frame}
          at={toScreen(camera, pointer)}
          clicks={[REASON_CLICK, SIGN_CLICK, COMMENT_CLICK, POST_CLICK]}
          opacity={
            shown *
            hiddenWhileTyping(frame, [
              [REASON_TYPE + 2, REASON_DONE + 1],
              [COMMENT_TYPE + 2, COMMENT_DONE + 1],
            ])
          }
        />
      }
    >
      <Shot name={base} />
      {frame < SIGNED ? (
        <>
          {frame >= REASON_CLICK ? (
            <>
              <Cover box={reasonField} />
              <Typed
                field={before.reason}
                text={typed(copy.reason, frame, REASON_TYPE, 1.05)}
                caret={Math.floor(frame / 9) % 2 === 0 || frame < REASON_DONE}
                multiline
              />
            </>
          ) : null}
          <FocusRing
            box={before.reason}
            radius={12}
            show={
              enter(frame, REASON_CLICK) * (1 - enter(frame, SIGN_CLICK - 2))
            }
          />
          <Piece
            name="petition"
            box={before.sign}
            radius={22}
            style={{ scale: `${1 - press(frame, SIGN_CLICK) * 0.05}` }}
          />
        </>
      ) : frame < SIGNED + 50 ? (
        <Morph frame={frame} />
      ) : null}
      <Heading frame={frame} />
      <Count frame={frame} />
      <Marks frame={frame} />
      {frame >= SIGNED ? (
        <>
          <Cover
            box={{
              ...after.reason,
              x: after.reason.x - 8,
              w: after.reason.w + 16,
            }}
            fill={color.background}
          />
          <Piece
            name="petition-signed"
            box={{
              ...after.reason,
              x: after.reason.x - 8,
              w: after.reason.w + 16,
            }}
            style={{ opacity: quote, translate: `0 ${mix(16, 0, quote)}px` }}
          />
        </>
      ) : null}
      {frame >= COMMENT_CLICK && frame < POSTED ? (
        <>
          <Cover
            box={{
              x: after.comment.x + 6,
              y: after.comment.y + 4,
              w: after.comment.w - 22,
              h: after.comment.h - 18,
            }}
          />
          <Typed
            field={after.comment}
            text={commentText}
            caret={Math.floor(frame / 9) % 2 === 0 || frame < COMMENT_DONE}
            multiline
          />
          {commentText.length > 0 ? (
            <PrimaryButton
              box={after.post}
              label="Post comment"
              pressed={press(frame, POST_CLICK)}
            />
          ) : null}
        </>
      ) : null}
      <FocusRing
        box={after.comment}
        radius={12}
        show={enter(frame, COMMENT_CLICK) * (1 - enter(frame, POSTED))}
      />
      {frame >= POSTED ? (
        <>
          {shift < 0.999 ? (
            <Piece
              name="petition-signed"
              box={{
                x: 0,
                y: after.comment.y + after.comment.h + 10,
                w: 1440,
                h:
                  after.thread.y +
                  after.thread.h -
                  after.comment.y -
                  after.comment.h -
                  10,
              }}
              style={{ translate: `0 ${lift * shift}px` }}
            />
          ) : null}
          <Cover
            box={{
              ...posted.newComment,
              x: posted.newComment.x - 2,
              w: posted.newComment.w + 4,
            }}
            fill={color.background}
          />
          <Piece
            name="petition-commented"
            box={posted.newComment}
            style={{
              opacity: newComment,
              translate: `0 ${mix(22, 0, newComment)}px`,
              clipPath: `inset(0 0 ${interpolate(newComment, [0, 1], [40, 0])}% 0)`,
            }}
          />
        </>
      ) : null}
    </PageCanvas>
  );
};
