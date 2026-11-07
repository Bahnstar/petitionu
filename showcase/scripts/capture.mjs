// Captures every app state the showcase animates, plus the on-page position of each element
// the video points at, types into, or redraws. Run after `seed.exs` (see README).
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL || "http://127.0.0.1:4000";
const password = process.env.SHOWCASE_PASSWORD;
if (!password) throw new Error("Set SHOWCASE_PASSWORD to the fixture password");

const app = `${base}/ash-typescript`;
const library = `${app}/petitions/7de00000-0000-7000-8000-000000000030`;
const classroom = `${app}/classrooms/7de00000-0000-7000-8000-000000000020`;
const directory = new URL("../public/captures/", import.meta.url).pathname;
const layoutFile = new URL("../src/layout.json", import.meta.url).pathname;
await mkdir(directory, { recursive: true });

const copy = {
  search: "library",
  reason: "My lab ends at 9. I need somewhere quiet to study after.",
  comment: "Could we start with finals week? I can help run a quick survey.",
  title: "Bring a weekly farmers market to campus",
  description:
    "Fresh food, local growers, and a place to meet. Let's bring a weekly farmers market to the quad so good food is easier to find between classes.",
};

const layout = { copy, captures: {} };
const browser = await chromium.launch({ headless: true });

const session = async (email) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  await page.goto(`${base}/sign-in`);
  await page.locator('input[name="user[email]"]:visible').first().fill(email);
  await page.locator('input[name="user[password]"]:visible').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/ash-typescript");
  return page;
};

// Page coordinates in CSS pixels, so the video can map them onto the 2x capture.
const box = async (page, locator) => {
  const target = locator.first();
  await target.waitFor();
  const rect = await target.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x + scrollX, y: y + scrollY, w: width, h: height };
  });
  return Object.fromEntries(
    Object.entries(rect).map(([key, value]) => [
      key,
      Math.round(value * 10) / 10,
    ]),
  );
};

// Text metrics for fields the video types into.
const field = async (page, locator) => ({
  ...(await box(page, locator)),
  style: await locator.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      paddingLeft:
        parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
      paddingTop:
        parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth),
      fontSize: parseFloat(style.fontSize),
      lineHeight:
        parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5,
      letterSpacing: parseFloat(style.letterSpacing) || 0,
      color: style.color,
    };
  }),
});

// Full-page by default; `viewport` keeps popovers open, since resizing closes them.
const capture = async (page, name, boxes, { viewport = false } = {}) => {
  await page.waitForTimeout(900);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  const entries = {};
  for (const [key, measure] of Object.entries(boxes))
    entries[key] = await measure();
  const size = await page.evaluate(
    (visible) => ({
      width: document.documentElement.clientWidth,
      height: visible ? innerHeight : document.documentElement.scrollHeight,
    }),
    viewport,
  );
  await page.screenshot({
    path: `${directory}${name}.png`,
    fullPage: !viewport,
    animations: "disabled",
    caret: "hide",
    style: "#tidewave-toolbar {display:none!important}",
  });
  layout.captures[name] = { ...size, boxes: entries };
  console.log(`${name}: ${size.width}x${size.height}`);
};

try {
  const student = await session("student1@showcase.petitionu.test");
  const page = student;

  // Discover
  await page.goto(`${app}/petitions`);
  await page
    .getByRole("heading", { name: "Keep the library open until midnight" })
    .waitFor();
  const search = page.getByPlaceholder("Search ideas, issues, and petitions");
  const cards = page
    .locator("a:has(h2), a:has(h3)")
    .filter({ hasText: "signatures" });
  const cardBoxes = async () => {
    const all = [];
    for (let index = 0; index < (await cards.count()); index += 1)
      all.push(await box(page, cards.nth(index)));
    return all;
  };
  const libraryCard = cards.filter({ hasText: "Keep the library open" });
  await capture(page, "browse", {
    search: () => field(page, search),
    heading: () => box(page, page.getByRole("heading", { level: 1 })),
    summary: () =>
      box(page, page.getByText(/petitions to explore/).locator("xpath=..")),
    cards: cardBoxes,
    library: () => box(page, libraryCard),
  });
  await search.fill(copy.search);
  await page.getByText(/^\d+ petitions? found/).waitFor();
  await capture(page, "browse-search", {
    search: () => field(page, search),
    summary: () =>
      box(page, page.getByText(/^\d+ petitions? found/).locator("xpath=..")),
    library: () => box(page, libraryCard),
  });

  // Sign
  await page.goto(library);
  const tally = page.locator("#petition-signature-panel");
  const reason = page.locator("#signature-reason");
  const commentField = page.locator("#petition-comment");
  const tallyBoxes = {
    tally: () => box(page, tally),
    heading: () => box(page, page.locator("#petition-tally-heading")),
    count: () => box(page, tally.locator(".petition-tally-count strong")),
    marks: () => box(page, tally.locator(".petition-marks")),
    mark: () => box(page, tally.locator(".petition-marks i")),
    note: () => box(page, tally.locator(".petition-tally-note")),
  };
  await capture(page, "petition", {
    ...tallyBoxes,
    title: () => box(page, page.getByRole("heading", { level: 1 })),
    form: () => box(page, tally.locator(".petition-tally-form")),
    reason: () => field(page, reason),
    sign: () => box(page, page.locator("#sign-petition")),
    share: () =>
      box(page, page.getByRole("button", { name: /Share this petition/ })),
    reasons: () =>
      box(
        page,
        page.locator("#petition-supporters-heading").locator("xpath=.."),
      ),
  });
  await reason.fill(copy.reason);
  await page.locator("#sign-petition").click();
  await page.getByRole("heading", { name: "You're part of this." }).waitFor();
  const reasons = page
    .locator("#petition-supporters-heading")
    .locator("xpath=..");
  const comments = page
    .locator("#petition-comments-heading")
    .locator("xpath=..");
  const thread = page.locator(".petition-thread > div");
  await capture(page, "petition-signed", {
    ...tallyBoxes,
    form: () => box(page, tally.locator(".petition-tally-form")),
    reasons: () => box(page, reasons),
    reason: () => box(page, reasons.locator(".petition-reasons li")),
    conversation: () => box(page, comments),
    comment: () => field(page, commentField),
    post: () => box(page, page.locator("#post-comment")),
    thread: () => box(page, page.locator(".petition-thread")),
  });

  // Discuss
  await commentField.fill(copy.comment);
  await page.locator("#post-comment").click();
  await page.getByText("Your comment has been posted.").waitFor();
  await capture(page, "petition-commented", {
    conversation: () => box(page, comments),
    comment: () => field(page, commentField),
    post: () => box(page, page.locator("#post-comment")),
    posted: () => box(page, page.getByText("Your comment has been posted.")),
    thread: () => box(page, page.locator(".petition-thread")),
    newComment: () => box(page, thread.filter({ hasText: copy.comment })),
  });

  // Create
  await page.goto(`${app}/create`);
  const title = page.locator("#title");
  const description = page.locator("#description");
  const formBoxes = {
    title: () => field(page, title),
    titleCount: () => box(page, page.getByText("/100")),
    category: () => box(page, page.locator("#category")),
    description: () => field(page, description),
    descriptionCount: () => box(page, page.getByText("/2,000")),
    publish: () =>
      box(page, page.getByRole("button", { name: "Publish petition" })),
    card: () =>
      box(
        page,
        page
          .locator("section.app-panel")
          .filter({ hasText: "Put your idea into words." }),
      ),
  };
  await capture(page, "create", formBoxes);
  await title.fill(copy.title);
  await page.locator("#category").click();
  const option = page
    .getByRole("option", { name: "Food & dining", exact: true })
    .last();
  await option.hover();
  await capture(
    page,
    "create-category",
    {
      listbox: () => box(page, page.getByRole("listbox")),
      option: () => box(page, option),
    },
    { viewport: true },
  );
  if (!(await option.isVisible())) await page.locator("#category").click();
  await option.click();
  await description.fill(copy.description);
  await page.locator("body").click({ position: { x: 5, y: 400 } });
  await capture(page, "create-filled", formBoxes);
  await page.getByRole("button", { name: "Publish petition" }).click();
  const live = page.getByRole("heading", { name: "Your idea is out there." });
  await capture(page, "published", {
    heading: () => box(page, live),
    panel: () => box(page, live.locator("xpath=..")),
    view: () =>
      box(page, page.getByRole("link", { name: "View your petition" })),
  });

  // Classrooms, as the professor who runs one
  const professor = await session("student2@showcase.petitionu.test");
  await professor.goto(classroom);
  await professor
    .getByRole("heading", { name: "Designing a better campus" })
    .waitFor();
  const members = professor
    .locator("section, div")
    .filter({ has: professor.getByText(/^Members \(/) });
  const joinCode = professor
    .locator("section, div")
    .filter({ has: professor.getByText("Join code", { exact: true }) });
  const copyButton = professor.getByRole("button", {
    name: "Copy",
    exact: true,
  });
  const classroomBoxes = {
    title: () => box(professor, professor.getByRole("heading", { level: 1 })),
    stats: () =>
      box(professor, professor.getByText(/\d+ members/).locator("xpath=..")),
    joinCode: () => box(professor, joinCode.last()),
    copy: () => box(professor, copyButton),
    members: () => box(professor, members.last()),
    memberRows: () =>
      members.last().evaluate((element) =>
        [...element.querySelectorAll("div.justify-between")].map((row) => {
          const { x, y, width, height } = row.getBoundingClientRect();
          return { x, y: y + scrollY, w: width, h: height };
        }),
      ),
    membersHeading: () => box(professor, professor.getByText(/^Members \(/)),
    petition: () =>
      box(
        professor,
        professor.locator("a").filter({ hasText: "Share lecture notes" }),
      ),
    start: () =>
      box(
        professor,
        professor.getByRole("link", { name: /Start a petition/ }).last(),
      ),
  };
  await capture(professor, "classroom", classroomBoxes);
  await copyButton.click();
  await professor.getByText("Copied!").waitFor();
  await capture(professor, "classroom-copied", {
    copied: () =>
      box(professor, professor.getByRole("button", { name: /Copied/ })),
  });

  await writeFile(layoutFile, `${JSON.stringify(layout, null, 2)}\n`);
} finally {
  await browser.close();
}
