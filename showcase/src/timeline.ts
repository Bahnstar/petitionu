// One place for every cue, in frames at 30 fps. Scenes overlap so each hands off to the next.
export const PROBLEM = { from: 0, duration: 158 };
export const BRIDGE = { from: 158, duration: 76 };
export const TOUR = { from: 206, duration: 980 };
export const CLOSE = { from: 1166, duration: 160 };
export const TOTAL = CLOSE.from + CLOSE.duration;

// Pages in the browser window, relative to the start of the tour. Each new page overlaps the
// last while it loads in.
export const PAGES = {
  browse: { from: 0, to: 196, title: "Petitions on your campus" },
  petition: {
    from: 182,
    to: 600,
    title: "Keep the library open until midnight",
  },
  create: { from: 586, to: 866, title: "Start a petition" },
  classroom: { from: 852, to: 980, title: "Designing a better campus" },
};

export type Chapter = {
  label: string;
  title: string[];
  body: string;
  from: number;
  to: number;
};

// Captions beside the window, relative to the start of the tour.
export const CHAPTERS: Chapter[] = [
  {
    label: "Discover",
    title: ["See what your", "campus wants."],
    body: "Every petition at your school in one place, trending ideas first.",
    from: 30,
    to: 200,
  },
  {
    label: "Sign",
    title: ["Add your name.", "Say why it matters."],
    body: "Your signature counts the moment you sign, and your reason joins the case.",
    from: 200,
    to: 414,
  },
  {
    label: "Discuss",
    title: ["Talk it through", "in the open."],
    body: "Ask questions, offer to help, keep it constructive. Every comment carries a name.",
    from: 414,
    to: 604,
  },
  {
    label: "Create",
    title: ["Turn a complaint", "into a clear ask."],
    body: "Say what should change and why it matters. It goes live the moment you publish.",
    from: 604,
    to: 866,
  },
  {
    label: "Classrooms",
    title: ["Bring your", "whole class in."],
    body: "Professors share a join code. Class petitions stay with the class.",
    from: 866,
    to: 960,
  },
];
