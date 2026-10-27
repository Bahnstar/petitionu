// Browser regression with RPC fixtures; no accounts or petitions are created.
import assert from "node:assert/strict"
import { isPrimitiveField } from "./rpc-fields.mts"
import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright")
const baseURL = process.env.BASE_URL || "http://localhost:4000"
const path = "/ash-typescript/petitions"
const categories = [
  { id: "campus", name: "Campus life" },
  { id: "study", name: "Study spaces" },
]
const petitions = Array.from({ length: 15 }, (_, index) => ({
  id: `petition-${index}`,
  title: index % 2 ? `Extend library hours ${index}` : `Improve campus gardens ${index}`,
  description: "Help make our campus a better place to learn, gather, and share ideas.",
  status: "open",
  goal: 100,
  signaturesCount: index * 5,
  trending: index > 10,
  author: "Alex Morgan",
  isAnonymous: index === 14,
  deadline: null,
  insertedAt: new Date(Date.UTC(2026, 8, index + 1)).toISOString(),
  categoryId: index % 2 ? "study" : "campus",
  category: categories[index % 2],
}))
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 } })
  const page = await context.newPage()
  // Load the public React shell for fixture authentication; server auth is covered in ExUnit.
  await page.route("**/ash-typescript/petitions*", async (route) => {
    if (!route.request().isNavigationRequest()) return route.continue()
    const response = await route.fetch({ url: `${baseURL}/ash-typescript` })
    await route.fulfill({ response })
  })
  const errors = []
  let categoryFailure = false
  let petitionFailure = false
  let emptyCategories = false
  let requests = 0
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/rpc/run", async (route) => {
    const request = route.request().postDataJSON()
    let data
    switch (request.action) {
      case "get_me":
        data = {
          id: "user",
          firstName: "Alex",
          lastName: "Morgan",
          role: "student",
          email: "alex@example.edu",
          profileComplete: true,
          emailVerified: true,
          organizationId: "university",
          organization: { name: "Example University" },
        }
        break
      case "get_categories":
        if (categoryFailure) {
          await route.fulfill({ json: { success: false, errors: [] } })
          return
        }
        data = emptyCategories ? [] : categories
        break
      case "get_petitions":
        requests++
        assert.equal(request.sort, "-insertedAt")
        assert(
          !request.fields.some((field) => field?.comments || field?.signatures || field?.updates),
        )
        assert(!request.fields.includes("daysLeft"))
        if (petitionFailure) {
          await route.fulfill({ json: { success: false, errors: [] } })
          return
        }
        // Deliberately return shuffled dates: newest must never depend on UUID order.
        data = petitions.map((petition) =>
          Object.fromEntries(
            request.fields.map((field) =>
              isPrimitiveField(field) ? [field, petition[field]] : ["category", petition.category],
            ),
          ),
        )
        break
      default:
        throw new Error(`Unexpected RPC: ${request.action}`)
    }
    await route.fulfill({ json: { success: true, data } })
  })
  const waitForCards = (count) =>
    page.waitForFunction(
      (expected) =>
        document.querySelectorAll('#browse-petitions-page a[id^="petition-"]').length === expected,
      count,
    )
  const cards = page.locator('#browse-petitions-page a[id^="petition-"]')
  await page.goto(`${path}?sort=newest&extra=keep`)
  await cards.first().waitFor()
  await waitForCards(12)
  assert.equal(await cards.count(), 12)
  assert.equal(await cards.first().getAttribute("id"), "petition-petition-14")
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await page.waitForURL(/page=2/)
  await waitForCards(3)
  assert.equal(await cards.count(), 3)
  assert.equal(await cards.first().getAttribute("id"), "petition-petition-2")
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
    await page.evaluate(() => {
      window.scrollTo(0, 0)
      return document.fonts.ready
    })
    await page.screenshot({
      path: join(process.env.SCREENSHOT_DIR, "browse-pagination-desktop.png"),
      fullPage: true,
      style: "#tidewave-toolbar { display: none !important; }",
    })
  }
  await page.goBack()
  await page.waitForURL((url) => !url.searchParams.has("page"))
  await waitForCards(12)
  assert.equal(await cards.count(), 12)
  const search = page.getByRole("searchbox", { name: "Search petitions" })
  await search.fill("library")
  assert.equal(new URL(page.url()).searchParams.get("q"), null)
  await page.waitForURL(/q=library/)
  await waitForCards(7)
  assert.equal(await cards.count(), 7)
  assert.equal(await search.evaluate((element) => element === document.activeElement), true)
  assert.equal(new URL(page.url()).searchParams.get("extra"), "keep")
  await page.getByRole("button", { name: "Campus life", exact: true }).click()
  await page.waitForURL(/category=campus/)
  await page.getByText("No ideas found just yet.").waitFor()
  await page.goBack()
  await cards.first().waitFor()
  await waitForCards(7)
  assert.equal(await cards.count(), 7)
  assert.equal(await search.inputValue(), "library")
  await page.getByRole("button", { name: "Clear filters", exact: true }).click()
  await page.waitForURL((url) => !url.searchParams.has("q"))
  await waitForCards(12)
  assert.equal(await search.inputValue(), "")
  assert.equal(await cards.count(), 12)
  assert.equal(requests, 1, "Client filters and pagination reuse the cached card data")
  await page.goto(`${path}?q=library&category=study&sort=newest&page=999`)
  await cards.first().waitFor()
  await waitForCards(7)
  assert.equal(await cards.count(), 7, "Out-of-range pages clamp to the last populated page")
  await page.setViewportSize({ width: 390, height: 844 })
  if (process.env.SCREENSHOT_DIR) {
    await page.evaluate(() => {
      window.scrollTo(0, 0)
      return document.fonts.ready
    })
    await page.screenshot({
      path: join(process.env.SCREENSHOT_DIR, "browse-filtered-mobile.png"),
      fullPage: true,
      style: "#tidewave-toolbar { display: none !important; }",
    })
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  emptyCategories = true
  await page.goto(`${path}?category=missing&sort=invalid&page=-2`)
  await page.getByText("No categories are available yet.").waitFor()
  await page.getByRole("button", { name: "Show all categories" }).click()
  await cards.first().waitFor()
  await waitForCards(12)
  assert.equal(await cards.count(), 12)
  emptyCategories = false
  categoryFailure = true
  await page.reload()
  await page.getByText("Categories are unavailable.", { exact: false }).waitFor({ timeout: 20000 })
  await waitForCards(12)
  assert.equal(await cards.count(), 12)
  categoryFailure = false
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await page.getByRole("button", { name: "Study spaces", exact: true }).waitFor()
  petitionFailure = true
  await page.reload()
  await page.getByText("Petitions couldn't load.").waitFor({ timeout: 20000 })
  petitionFailure = false
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await cards.first().waitFor()
  assert.deepEqual(errors, [])
  console.log(
    "PASS browse: pagination, newest, debounce/focus, URL/history, cache, mobile, empty categories, independent retries",
  )
  await context.close()
} finally {
  await browser.close()
}
