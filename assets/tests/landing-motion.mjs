import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright")
const baseURL = process.env.BASE_URL || "http://localhost:4000"
const browser = await chromium.launch()

try {
  for (const width of [1440, 390]) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width, height: 1000 },
        reducedMotion,
      })
      try {
        const page = await context.newPage()
        const errors = []
        page.on("pageerror", (error) => errors.push(error.message))
        await page.route("**/rpc/run", (route) =>
          route.fulfill({ json: { success: true, data: null } }),
        )
        await page.addInitScript(() => {
          window.placardAnimations = []
          const animate = Element.prototype.animate
          Element.prototype.animate = function (...args) {
            const animation = animate.apply(this, args)
            if (this.matches(".landing-sign")) {
              window.placardAnimations.push({
                className: this.className,
                keyframes: animation.effect.getKeyframes(),
                duration: animation.effect.getTiming().duration,
              })
            }
            return animation
          }
        })
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await page
          .locator(".landing-sign")
          .first()
          .evaluate((sign) => sign.scrollIntoView({ block: "center", behavior: "instant" }))

        if (reducedMotion === "no-preference") {
          await page.waitForFunction(() => window.placardAnimations.length >= 2, null, {
            timeout: 5000,
          })
          const animations = await page.evaluate(() => window.placardAnimations)
          const transforms = animations.filter((animation) =>
            animation.keyframes.some((frame) => "transform" in frame),
          )
          assert.equal(
            new Set(transforms.map((animation) => animation.className)).size,
            2,
            "Both placards must animate through the browser without a JavaScript callback per frame",
          )
          assert(
            transforms.every((animation) =>
              animation.keyframes.every((frame) => !frame.transform.includes("var(")),
            ),
            "Resolve responsive transforms before starting the native animation",
          )
        }

        await page.waitForFunction(() =>
          [...document.querySelectorAll(".landing-sign")].every(
            (sign) =>
              new DOMMatrix(getComputedStyle(sign).transform).isIdentity &&
              sign
                .getAnimations()
                .every(
                  (animation) =>
                    animation.effect.getTiming().iterations === Infinity ||
                    animation.playState === "finished",
                ),
          ),
        )
        const count = await page.evaluate(() => window.placardAnimations.length)
        await page.locator(".landing-footer").scrollIntoViewIfNeeded()
        await page
          .locator(".landing-sign")
          .first()
          .evaluate((sign) => sign.scrollIntoView({ block: "center", behavior: "instant" }))
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        )
        assert.equal(
          await page.evaluate(() => window.placardAnimations.length),
          count,
          "Entrances must not replay on scroll",
        )
        if (reducedMotion === "reduce") {
          assert(
            await page.evaluate(() =>
              window.placardAnimations.every((animation) => animation.duration === 0),
            ),
            "Reduced motion must skip animated travel",
          )
          assert(
            await page
              .locator(".landing-sign")
              .evaluateAll((signs) =>
                signs.every((sign) => getComputedStyle(sign).animationName === "none"),
              ),
          )
        } else {
          await page.waitForFunction(() =>
            [...document.querySelectorAll(".landing-sign")].every((sign) =>
              sign
                .getAnimations()
                .some(
                  (animation) =>
                    animation.effect.getTiming().iterations === Infinity &&
                    animation.playState === "running",
                ),
            ),
          )
        }
        assert.deepEqual(
          await page
            .locator(".landing-sign")
            .evaluateAll((signs) => signs.map((sign) => getComputedStyle(sign).rotate)),
          width === 1440 ? ["-9deg", "8deg"] : ["-5deg", "5deg"],
        )
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))

        const toggle = page.locator("#navigation-toggle")
        if (await toggle.isVisible()) await toggle.click()
        const nav = page.locator("#landing-header-browse")
        await page.keyboard.press("Tab")
        await nav.focus()
        assert.equal(
          await nav.evaluate((link) => getComputedStyle(link, "::after").transitionDuration),
          reducedMotion === "reduce" ? "0s" : "0.16s",
          "Header underlines should reveal gradually unless reduced motion is enabled",
        )
        assert.equal(await nav.evaluate((link) => getComputedStyle(link).outlineStyle), "solid")
        assert.deepEqual(errors, [])
        console.log(
          `PASS ${width}/${reducedMotion}: native entrance, looping drift, responsive tilt, gradual underlines`,
        )
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
}
