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
  profileComplete: true,
  emailVerified: true,
  graduationYear: 2027,
  organizationId: "22222222-2222-4222-8222-222222222222",
  organization: { id: "22222222-2222-4222-8222-222222222222", name: "Example University" },
  insertedAt: "2026-01-01T00:00:00Z",
  petitions: [],
  signatures: [],
  numPetitions: 0,
  numSigned: 0,
  totalPetitionSignatures: 0,
}

if (screenshotDir) await mkdir(screenshotDir, { recursive: true })
async function openHeaderMenu(page) {
  await page.locator(".site-header").waitFor({ timeout: 30000 })
  const toggle = page.locator("#navigation-toggle")
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click()
}

async function headerMetrics(page) {
  return page.locator(".site-header").evaluate((header) => {
    const measure = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        x: rect.x,
        y: rect.height ? rect.y + window.scrollY : 0,
        width: rect.width,
        height: rect.height,
        font: style.font,
        padding: style.padding,
        borderRadius: style.borderRadius,
      }
    }
    return {
      header: measure(header),
      brand: measure(header.querySelector(".site-brand")),
      cta: measure(header.querySelector(".site-header-cta")),
      browse: measure(header.querySelector(".site-navigation a")),
    }
  })
}

const browser = await chromium.launch()
try {
  for (const state of ["user", "guest"]) {
    for (const [size, viewport] of Object.entries({
      desktop: { width: 1600, height: 1000 },
      tablet: { width: 760, height: 1000 },
      mobile: { width: 320, height: 900 },
    })) {
      const context = await browser.newContext({ baseURL, viewport, reducedMotion: "reduce" })
      const page = await context.newPage()
      page.setDefaultTimeout(5000)
      page.setDefaultNavigationTimeout(30000)
      let releaseAuth
      const authGate = new Promise((resolve) => {
        releaseAuth = resolve
      })
      await page.route("**/rpc/run", async (route) => {
        const { action } = route.request().postDataJSON()
        if (action === "get_me") await authGate
        function responseData() {
          if (action === "get_me") return state === "user" ? user : null
          if (action === "get_user_by_id") return user
          return []
        }
        const data = responseData()
        await route.fulfill({ json: { success: true, data } })
      })

      try {
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await page.locator("#landing-header").waitFor({ timeout: 30000 })
        await page.evaluate(() => document.fonts.ready)
        const landingHeader = await page.locator("#landing-header").boundingBox()
        await page.locator(".site-header").evaluate((header) => {
          window.originalHeader = header
        })
        assert.equal(
          await page.locator(':is(#landing-page, #landing-header) a[href^="/sign-in"]').count(),
          0,
          `${state}/${size}: do not show Sign in before authentication resolves`,
        )
        assert.equal(
          await page.locator(`#landing-header a[href="${home}/petitions"]`).count(),
          1,
          "Browse petitions remains available while authentication loads",
        )
        releaseAuth()

        await openHeaderMenu(page)
        const accountHref =
          state === "user"
            ? `${home}/dashboard`
            : `/sign-in?${new URLSearchParams({ return_to: home })}`
        for (const region of ["#landing-header", ".landing-footer"]) {
          const account = page.locator(`${region} a[href="${accountHref}"]:visible`)
          await account.waitFor({ state: "visible" })
          assert.equal(await account.textContent(), state === "user" ? "My dashboard" : "Sign in")
          assert.equal(
            await page.locator(`${region} a[href="${home}/petitions"]`).isVisible(),
            true,
          )
        }
        if (state === "user")
          assert.equal(await page.locator('#landing-page a[href^="/sign-in"]').count(), 0)
        else
          assert.equal(await page.locator(`#landing-page a[href="${home}/dashboard"]`).count(), 0)
        const toggle = page.locator("#navigation-toggle")
        if (await toggle.isVisible()) {
          await page.keyboard.press("Escape")
          assert.equal(await toggle.getAttribute("aria-expanded"), "false")
          assert.equal(await toggle.evaluate((button) => button === document.activeElement), true)
        }
        const metrics = await headerMetrics(page)
        const resolvedHeader = await page.locator("#landing-header").boundingBox()
        assert(
          Math.abs(resolvedHeader.width - landingHeader.width) < 1,
          "Resolving authentication must not resize the landing header",
        )
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
          "Landing page must fit the viewport",
        )

        if (screenshotDir) {
          await page.evaluate(() => document.fonts.ready)
          await page.screenshot({
            path: join(screenshotDir, `landing-navigation-${state}-${size}.png`),
            fullPage: true,
            timeout: 30000,
            style: "#tidewave-toolbar { display: none !important; }",
          })
        }

        await openHeaderMenu(page)
        await page.locator(`#landing-header a[href="${home}/petitions"]`).click()
        await page.waitForURL(`${home}/petitions`)
        assert.equal(
          await page.evaluate(
            () => window.originalHeader === document.querySelector(".site-header"),
          ),
          true,
          "Navigation must keep the same header DOM node",
        )
        assert.deepEqual(
          await headerMetrics(page),
          metrics,
          "Header, logo, button and Browse link must preserve geometry and typography across routes",
        )
        const appHeader = await page.locator("#app-header").boundingBox()
        assert(
          Math.abs(appHeader.width - landingHeader.width) < 1,
          "Application and landing headers must have the same width",
        )
        assert(
          Math.abs(appHeader.x - landingHeader.x) < 1,
          "Application and landing headers must have the same side margins",
        )
        await page.goBack()
        await page.locator("#landing-header").waitFor()
        await page.locator(`.landing-footer a[href="${home}/petitions"]`).click()
        await page.waitForURL(`${home}/petitions`)

        for (const region of ["#landing-header", ".landing-footer"]) {
          await page.goto(home, { waitUntil: "domcontentloaded" })
          if (region === "#landing-header") await openHeaderMenu(page)
          await page.locator(`${region} a[href="${accountHref}"]:visible`).click({ timeout: 30000 })
          await page.waitForURL(accountHref, { waitUntil: "domcontentloaded" })
          if (state === "user") {
            assert.deepEqual(
              await headerMetrics(page),
              metrics,
              "Dashboard must preserve header geometry and typography",
            )
            const dashboardHeader = await page.locator("#app-header").boundingBox()
            assert(
              Math.abs(dashboardHeader.width - landingHeader.width) < 1,
              "The signed-in dashboard must preserve the landing header width",
            )
          }
        }
        console.log(
          `PASS ${state}/${size}: loading state, account links, navigation, persistent header, identical typography and geometry, keyboard menu, viewport`,
        )
      } finally {
        releaseAuth()
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
}
