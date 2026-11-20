import {
  Easing,
  interpolate,
  random,
  spring,
  type SpringConfig,
} from "remotion";

export const FPS = 30;

// Camera and cursor moves: slow in, slow out, like a hand on a trackpad.
export const glide = Easing.bezier(0.65, 0, 0.35, 1);
// Exits: leave quickly.
export const exit = Easing.bezier(0.55, 0, 1, 0.45);

// Critically damped: settles without overshoot. For entrances and state changes.
export const SETTLE: Partial<SpringConfig> = { damping: 200 };
// A touch of overshoot for things that should feel physical (presses, new marks).
export const SNAP: Partial<SpringConfig> = {
  damping: 13,
  stiffness: 190,
  mass: 0.6,
};
// Headlines: soft, slightly heavy.
export const SOFT: Partial<SpringConfig> = {
  damping: 22,
  stiffness: 90,
  mass: 0.9,
};

export const enter = (
  frame: number,
  start: number,
  config: Partial<SpringConfig> = SETTLE,
  durationInFrames?: number,
) => spring({ frame: frame - start, fps: FPS, config, durationInFrames });

export const ramp = (
  frame: number,
  start: number,
  duration: number,
  easing: (t: number) => number = glide,
) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

export const mix = (from: number, to: number, t: number) =>
  from + (to - from) * t;

// A click: the pointer dips, then recovers.
export const press = (frame: number, at: number) =>
  interpolate(frame, [at - 4, at, at + 9], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export type Point = { x: number; y: number };
export type Camera = Point & { z: number };
export type Stop<T> = { at: number; to: T; dur?: number };

// Holds each waypoint until the next stop begins, then glides to it. Zoom interpolates in log
// space so pushing in and pulling out feel equally fast.
export function path<T extends Record<string, number>>(
  frame: number,
  start: T,
  stops: Stop<T>[],
  defaultDuration = 28,
  arc = 0,
): T {
  let value = start;
  for (const stop of stops) {
    if (frame < stop.at) break;
    const t = ramp(frame, stop.at, stop.dur ?? defaultDuration);
    const next = {} as Record<string, number>;
    for (const key of Object.keys(stop.to)) {
      next[key] =
        key === "z"
          ? Math.exp(mix(Math.log(value[key]), Math.log(stop.to[key]), t))
          : mix(value[key], stop.to[key], t);
    }
    // Pointers travel on a shallow arc rather than a ruler-straight line.
    if (arc && "x" in next && "y" in next) {
      const lift = Math.sin(Math.PI * t) * arc;
      next.y -= lift * Math.sign(stop.to.x - value.x || 1);
    }
    value = next as T;
  }
  return value;
}

// When each character lands, with a slightly uneven human rhythm.
export const keystrokes = (
  text: string,
  start: number,
  framesPerChar: number,
) => {
  const times: number[] = [];
  let t = start;
  for (let index = 0; index < text.length; index += 1) {
    t += framesPerChar * (0.55 + random(`${text}-${index}`) * 0.9);
    if (text[index - 1] === " " || text[index - 1] === ".")
      t += framesPerChar * 0.6;
    times.push(t);
  }
  return times;
};

export const typed = (
  text: string,
  frame: number,
  start: number,
  framesPerChar: number,
) => {
  const times = keystrokes(text, start, framesPerChar);
  const count = times.filter((time) => time <= frame).length;
  return text.slice(0, count);
};

export const typingEnds = (
  text: string,
  start: number,
  framesPerChar: number,
) => {
  const times = keystrokes(text, start, framesPerChar);
  return Math.ceil(times[times.length - 1] ?? start);
};

// Like on a Mac, the pointer hides while someone types and returns once the typing stops.
export const hiddenWhileTyping = (frame: number, spans: [number, number][]) =>
  spans.reduce(
    (shown, [from, to]) =>
      shown * (1 - ramp(frame, from, 6) * (1 - ramp(frame, to, 6))),
    1,
  );
