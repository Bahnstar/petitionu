import { useCurrentFrame } from "remotion";
import { Cursor } from "../../components/Cursor";
import {
  Cover,
  PageCanvas,
  Piece,
  Shot,
  toScreen,
} from "../../components/Page";
import { shots } from "../../layout";
import { enter, exit, mix, path, ramp, SETTLE, SNAP } from "../../motion";

const room = shots.classroom.boxes;
const copied = shots["classroom-copied"].boxes;
const COPY_CLICK = 40;

// The professor's view: copy the join code, and the class list fills in.
export const Classroom = () => {
  const frame = useCurrentFrame();
  const camera = path(frame, { x: 720, y: 500, z: 1 }, [
    { at: 6, to: { x: 1109, y: 545, z: 1.6 }, dur: 32 },
    { at: 60, to: { x: 1010, y: 905, z: 1.28 }, dur: 36 },
  ]);
  const pointer = path(
    frame,
    { x: 860, y: 780 },
    [
      {
        at: 12,
        to: {
          x: copied.copied.x + copied.copied.w / 2 + 4,
          y: copied.copied.y + 18,
        },
        dur: 24,
      },
    ],
    28,
    30,
  );
  const done = enter(frame, COPY_CLICK + 2, SNAP);
  const rows = room.memberRows;
  const list = {
    x: rows[0].x - 4,
    y: rows[0].y - 6,
    w: rows[0].w + 8,
    h: rows[rows.length - 1].y + rows[rows.length - 1].h - rows[0].y + 12,
  };
  return (
    <PageCanvas
      camera={camera}
      height={shots.classroom.height}
      overlay={
        <Cursor
          frame={frame}
          at={toScreen(camera, pointer)}
          clicks={[COPY_CLICK]}
          opacity={enter(frame, 8) * (1 - ramp(frame, 62, 10, exit))}
        />
      }
    >
      <Shot name="classroom" />
      <Piece
        name="classroom-copied"
        box={copied.copied}
        radius={18}
        style={{
          opacity: Math.min(1, done * 2),
          scale: `${frame >= COPY_CLICK ? mix(0.94, 1, done) : 1}`,
        }}
      />
      <Cover box={list} />
      {rows.map((row, index) => {
        const arrive = enter(frame, 62 + index * 3.5, SETTLE);
        return (
          <Piece
            key={index}
            name="classroom"
            box={row}
            style={{ opacity: arrive, translate: `0 ${mix(18, 0, arrive)}px` }}
          />
        );
      })}
    </PageCanvas>
  );
};
