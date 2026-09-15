import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright")
const baseURL = process.env.BASE_URL || "http://localhost:4000"
const petitionId = "01900000-0000-7000-8000-000000000001"
const path = `/ash-typescript/petitions/${petitionId}`
const browser = await chromium.launch()

try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 900 } })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.route("**/rpc/run", async (route) => {
      const request = route.request().postDataJSON()
      if (request.action === "get_me") {
        await route.fulfill({ json: { success: true, data: null } })
        return
      }
      assert.equal(request.action, "get_petition_by_id")
      assert.equal(request.input.id, petitionId)
      assert(
        !request.fields.some((field) => field?.comments || field?.signatures || field?.updates),
      )
      await route.fulfill({
        json: {
          success: true,
          data: {
            id: petitionId,
            title: "Keep the library open",
            description: "More evening study time.",
            status: "open",
            author: "Alex Student",
            goal: 100,
            signaturesCount: 25,
            hasSigned: false,
            canManage: false,
            allowComments: true,
            isAnonymous: false,
            deadline: null,
            insertedAt: "2026-09-01T00:00:00Z",
            category: { id: "campus", name: "Campus" },
          },
        },
      })
    })
    await page.goto(path)
    await page.locator("#petition-detail-page").waitFor()
    assert.equal(await page.locator("h1").textContent(), "Keep the library open")
    assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "25")
    assert.equal(await page.locator('a[href="/ash-typescript/petitions"]').count(), 0)
    assert.equal(
      await page.locator("#petition-comments, #petition-comment-form, #sign-petition-form").count(),
      0,
    )
    assert.equal(await page.locator("#sign-petition").textContent(), "Sign this petition")
    const signIn = `/sign-in?${new URLSearchParams({ return_to: path })}`
    assert.equal(await page.locator("#sign-petition").getAttribute("href"), signIn)
    await page.locator("#sign-petition").click()
    await page.waitForURL(signIn)
    assert.deepEqual(errors, [])
    console.log(
      `PASS shared link at ${width}px: summary, progress, restricted activity, sign-in destination`,
    )
    await context.close()
  }
} finally {
  await browser.close()
}
