// Start the Phoenix app, then run from the repository root:
// PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node assets/tests/landing-navigation.mjs
// BASE_URL defaults to http://localhost:4000; SCREENSHOT_DIR is optional.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright")
const baseURL = process.env.BASE_URL || "http://localhost:4000"
const screenshotDir = process.env.SCREENSHOT_DIR
const home = "/ash-typescript"
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "student@example.edu",
  firstName: "Alex",
  lastName: "Morgan",
  role: "student",
  insertedAt: "2026-01-01T00:00:00Z",
  petitions: [], signatures: [], numPetitions: 0, numSigned: 0, totalPetitionSignatures: 0,
}

if (screenshotDir) await mkdir(screenshotDir, { recursive: true })
const browser = await chromium.launch()
try {
  for (const state of ["user", "guest"]) {
    for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 320, height: 900 } })) {
      const context = await browser.newContext({ baseURL, viewport, reducedMotion: "reduce" })
      const page = await context.newPage()
      page.setDefaultTimeout(5000)
      page.setDefaultNavigationTimeout(30000)
      let releaseAuth
      const authGate = new Promise((resolve) => { releaseAuth = resolve })
      await page.route("**/rpc/run", async (route) => {
        const { action } = route.request().postDataJSON()
        if (action === "get_me") await authGate
        const data = action === "get_me" ? (state === "user" ? user : null) : action === "get_user_by_id" ? user : []
        await route.fulfill({ json: { success: true, data } })
      })

      try {
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await page.locator("#landing-header").waitFor()
        assert.equal(await page.locator('#landing-page a[href="/sign-in"]').count(), 0, `${state}/${size}: do not show Sign in before authentication resolves`)
        assert.equal(await page.locator(`#landing-header a[href="${home}/petitions"]`).count(), 1, "Browse petitions remains available while authentication loads")
        releaseAuth()

        const accountHref = state === "user" ? `${home}/dashboard` : "/sign-in"
        for (const region of ["#landing-header", ".landing-footer"]) {
          const account = page.locator(`${region} a[href="${accountHref}"]`)
          await account.waitFor({ state: "visible" })
          assert.equal(await account.textContent(), state === "user" ? "My dashboard" : "Sign in")
          assert.equal(await page.locator(`${region} a[href="${home}/petitions"]`).isVisible(), true)
        }
        if (state === "user") assert.equal(await page.locator('#landing-page a[href="/sign-in"]').count(), 0)
        else assert.equal(await page.locator(`#landing-page a[href="${home}/dashboard"]`).count(), 0)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Landing page must fit the viewport")

        if (screenshotDir) {
          await page.evaluate(() => document.fonts.ready)
          await page.screenshot({
            path: join(screenshotDir, `landing-navigation-${state}-${size}.png`),
            fullPage: true,
            timeout: 30000,
            style: "#tidewave-toolbar { display: none !important; }",
          })
        }

        await page.locator(`#landing-header a[href="${home}/petitions"]`).click()
        await page.waitForURL(`${home}/petitions`)
        await page.goBack()
        await page.locator("#landing-header").waitFor()
        await page.locator(`.landing-footer a[href="${home}/petitions"]`).click()
        await page.waitForURL(`${home}/petitions`)

        for (const region of ["#landing-header", ".landing-footer"]) {
          await page.goto(home, { waitUntil: "domcontentloaded" })
          await page.locator(`${region} a[href="${accountHref}"]`).click({ timeout: 30000 })
          await page.waitForURL(accountHref, { waitUntil: "domcontentloaded" })
        }
        console.log(`PASS ${state}/${size}: loading state, account links, browse navigation, viewport`)
      } finally {
        releaseAuth()
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
}
