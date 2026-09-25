import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:4000";
const password = process.env.SHOWCASE_PASSWORD;
if (!password) throw new Error("Set SHOWCASE_PASSWORD to the fixture password");
const directory = new URL("../public/captures/", import.meta.url).pathname;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const capture = async (name) => {
    await page.waitForTimeout(1100);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${directory}${name}.png`,
      style: "#tidewave-toolbar {display:none!important}",
      animations: "disabled",
    });
    console.log(
      `${name}: ${(await page.locator("body").innerText()).slice(0, 1800)}`,
    );
  };
  await page.goto(`${base}/ash-typescript`);
  await capture("landing");
  await page.goto(`${base}/sign-in`);
  await page
    .locator('input[name="user[email]"]:visible')
    .first()
    .fill("student1@showcase.petitionu.test");
  await page.locator('input[name="user[password]"]:visible').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/ash-typescript");
  await page.goto(`${base}/ash-typescript/petitions`);
  await page
    .getByRole("heading", { name: "Keep the library open until midnight" })
    .waitFor();
  await page.evaluate(() => window.scrollTo(0, 400));
  await capture("browse");
  await page.goto(
    `${base}/ash-typescript/petitions/7de00000-0000-7000-8000-000000000030`,
  );
  await capture("petition");
  const sign = page.getByRole("button", {
    name: "Sign this petition",
    exact: true,
  });
  if (await sign.isVisible()) {
    await page
      .getByPlaceholder("Tell your community why this matters.")
      .fill("A quiet place to study after evening labs would help so much.");
    await sign.click();
    await page.getByRole("heading", { name: "You're part of this." }).waitFor();
  }
  await capture("signed");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await capture("discussion");
  await page.goto(`${base}/ash-typescript/create`);
  await page.locator("#title").fill("Bring a weekly farmers market to campus");
  await page
    .locator("#description")
    .fill(
      "Fresh food, local growers, and a place to meet. Let’s bring a weekly farmers market to the student quad so good food is easier to find between classes.",
    );
  await page.locator("#category").click();
  await page
    .getByRole("option", { name: "Food & dining", exact: true })
    .last()
    .click();
  await page.locator("#title").focus();
  await page.evaluate(() => window.scrollTo(0, 355));
  await capture("create");
  await page.goto(
    `${base}/ash-typescript/classrooms/7de00000-0000-7000-8000-000000000020`,
  );
  await capture("classroom");
} finally {
  await browser.close();
}
