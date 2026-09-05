// Uses the running app with field-selective RPC fixtures; no database writes.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright")
const baseURL = process.env.BASE_URL || "http://localhost:4000"
const screenshotDir = process.env.SCREENSHOT_DIR
async function capture(page, filename) {
  if (!screenshotDir) return
  await mkdir(screenshotDir, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(screenshotDir, filename), fullPage: true, animations: "disabled",
    style: "#tidewave-toolbar { display: none !important; }",
  })
}
const home = "/ash-typescript"
const user = { id: "user-1", firstName: "Alex", lastName: "Morgan", email: "alex@example.edu", role: "student", emailVerified: true, profileComplete: true, organizationId: "campus-1", organization: { name: "Example University" }, petitions: [], signatures: [], numPetitions: 0, numSigned: 0, totalPetitionSignatures: 0 }
const classroom = { id: "class-1", name: "Campus ideas", professorId: "professor-1", professor: { firstName: "Pat", lastName: "Lee" }, allowStudentPetitions: true, archived: false, memberCount: 2, petitionCount: 1 }
const petition = { id: "petition-1", title: "Library hours", description: "Keep the library open later.", status: "open", goal: 100, signaturesCount: 3, isAnonymous: true, author: "Private Author", deadline: "2020-01-01T00:00:00Z", classroomId: classroom.id, category: { id: "category-1", name: "Campus" }, allowComments: true, comments: [], updates: [], signatures: [] }
function select(value, fields) {
  if (value == null || !fields) return value
  if (Array.isArray(value)) return value.map((item) => select(item, fields))
  return Object.fromEntries(fields.flatMap((field) => typeof field === "string" ? [[field, value[field]]] : Object.entries(field).map(([key, nested]) => [key, select(value[key], nested)])))
}
const browser = await chromium.launch()
let failures = 0
async function check(name, options, run) {
  if (process.env.CHECK && !name.includes(process.env.CHECK)) return
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(30000)
  let signedIn = !options.guest
  let signatures = 3
  let petitionCount = 1
  const calls = []
  const changes = {}
  const updates = []
  let rejectOwnerChange = !!options.rejectOwnerChange
  await page.route("**/rpc/run", async (route) => {
    const request = route.request().postDataJSON()
    calls.push(request)
    const currentUser = signedIn ? { ...user, role: options.role || "student", emailVerified: !options.incomplete, profileComplete: !options.incomplete } : null
    const currentPetition = { ...petition, deadline: options.open ? null : petition.deadline, signaturesCount: signatures, hasSigned: signatures > 3, canManage: !!options.owner, ...changes, updates }
    if (request.action === "update_petition" && rejectOwnerChange) {
      rejectOwnerChange = false
      await route.fulfill({ json: { success: false, errors: [{ message: "Please choose a future deadline." }] } })
      return
    }
    let data
    switch (request.action) {
      case "get_me": data = currentUser; break
      case "get_user_by_id": data = currentUser; break
      case "get_categories": data = [petition.category]; break
      case "get_my_classrooms": data = [{ ...classroom, petitionCount }]; break
      case "get_classroom_by_id": data = { ...classroom, petitionCount }; break
      case "get_classroom_petitions": case "get_petitions": data = [currentPetition]; break
      case "get_memberships_for_classroom": data = [
        { id: "self", user, role: options.ta ? "ta" : "student", status: options.status || "active" },
        { id: "pending", memberName: "Sam", user: { id: "other", firstName: "Sam" }, role: "student", status: "pending" },
        { id: "active", memberName: "Jo", user: { id: "active-user", firstName: "Jo" }, role: "student", status: "active" },
      ]; break
      case "update_petition": Object.assign(changes, request.input); data = { id: petition.id }; break
      case "create_update": updates.push({ id: "update-1", ...request.input }); data = { id: "update-1" }; break
      case "close_petition": changes.status = "closed"; data = { id: petition.id }; break
      case "mark_petition_victory": changes.status = "victory"; data = { id: petition.id }; break
      case "create_signature": signatures++; data = { id: "signature-1" }; break
      case "create_classroom_petition": case "create_petition": petitionCount++; data = { id: "new-petition" }; break
      case "approve_membership": case "remove_from_classroom": data = { id: request.identity }; break
      default: data = []
    }
    await route.fulfill({ json: { success: true, data: select(data, request.fields) } })
  })
  try {
    await run(page, calls, () => { signedIn = true })
    console.log(`PASS ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${name}: ${error.message}`)
  } finally { await context.close() }
}
try {
  await check("owner edits, posts updates, and confirms closure", { owner: true, open: true }, async (page, calls) => {
    await page.goto(`${home}/petitions/petition-1`, { waitUntil: "domcontentloaded" })
    await page.locator("#edit-petition").click()
    await page.locator("#edit-petition-title").fill("Later library hours")
    await page.locator("#confirm-petition-edit").click()
    await page.getByRole("heading", { level: 1, name: "Later library hours" }).waitFor()
    assert.equal(calls.find((call) => call.action === "update_petition").input.status, undefined)
    await page.locator("#add-petition-update").click()
    await page.locator("#petition-update-title").fill("Meeting scheduled")
    await page.locator("#petition-update-body").fill("We will meet the library team this week.")
    await page.locator("#confirm-petition-update").click()
    await page.getByRole("heading", { name: "Meeting scheduled" }).waitFor()
    await page.locator("#close-petition").click()
    assert.equal(calls.filter((call) => call.action === "close_petition").length, 0)
    await page.locator("#confirm-petition-close").click()
    await page.getByText("Your petition is closed.", { exact: true }).waitFor()
    assert.equal(await page.locator("#sign-petition").count(), 0)
    assert.equal(await page.locator("#post-comment").count(), 0)
    await page.locator("#mark-petition-victory").click()
    await page.locator("#confirm-petition-victory").click()
    await page.getByText("Your petition has been marked as a victory.", { exact: true }).waitFor()
    assert.equal(await page.locator("#mark-petition-victory").count(), 0)
  })
  await check("owner can correct a rejected edit", { owner: true, open: true, rejectOwnerChange: true }, async (page) => {
    await page.goto(`${home}/petitions/petition-1`, { waitUntil: "domcontentloaded" })
    await page.locator("#edit-petition").click()
    await page.locator("#edit-petition-title").fill("A revised petition")
    await page.locator("#confirm-petition-edit").click()
    await page.getByRole("alert").filter({ hasText: "Please choose a future deadline." }).waitFor()
    assert.equal(await page.locator("#edit-petition-title").inputValue(), "A revised petition")
    await page.locator("#confirm-petition-edit").click()
    await page.getByRole("heading", { level: 1, name: "A revised petition" }).waitFor()
  })
  await check("non-owners have no creator controls", { open: true }, async (page, calls) => {
    await page.goto(`${home}/petitions/petition-1`, { waitUntil: "domcontentloaded" })
    await page.locator("#petition-detail-page").waitFor()
    assert.equal(await page.locator("#petition-owner-controls").count(), 0)
    const request = calls.find((call) => call.action === "get_petitions")
    assert.doesNotMatch(JSON.stringify(request.fields), /userId|"user"/)
  })
  await check("incomplete accounts cannot participate", { open: true, incomplete: true }, async (page) => {
    await page.goto(`${home}/petitions/petition-1`, { waitUntil: "domcontentloaded" })
    await page.locator("#petition-detail-page").waitFor()
    assert.equal(await page.locator("#sign-petition").count(), 0)
    assert.equal(await page.locator("#post-comment").count(), 0)
    assert.ok(await page.locator(`a[href="${home}/profile"]`).count() > 0)
    await page.goto(`${home}/create`, { waitUntil: "domcontentloaded" })
    assert.equal(await page.locator("#publish-petition").isDisabled(), true)
  })
  await check("campus browse defaults to actor campus", {}, async (page, calls) => {
    await page.goto(`${home}/petitions`, { waitUntil: "domcontentloaded" })
    await page.locator("#petition-petition-1").waitFor()
    assert.deepEqual(calls.find((call) => call.action === "get_petitions").filter, { organizationId: { eq: "campus-1" } })
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/rpc/run") && response.request().postDataJSON()?.action === "get_petitions"),
      page.locator("#all-campuses").click(),
    ])
    assert.equal(calls.filter((call) => call.action === "get_petitions").at(-1).filter, undefined)
  })
  await check("anonymous classroom authors", {}, async (page) => {
    await page.goto(`${home}/classrooms/class-1`, { waitUntil: "domcontentloaded" })
    const card = page.locator("#petition-petition-1")
    await card.waitFor()
    assert.match(await card.textContent(), /Started by Anonymous/)
    assert.doesNotMatch(await card.textContent(), /Private Author/)
  })
  await check("expired classroom petitions", {}, async (page) => {
    await page.goto(`${home}/classrooms/class-1`, { waitUntil: "domcontentloaded" })
    await page.locator("#petition-petition-1").waitFor()
    assert.match(await page.locator("#petition-petition-1").textContent(), /Closed/)
  })
  await check("students have no classroom creation entry", {}, async (page) => {
    await page.goto(`${home}/classrooms`, { waitUntil: "domcontentloaded" })
    await page.getByRole("heading", { name: "My classrooms", exact: true }).waitFor()
    assert.equal(await page.locator("#create-classroom-link").count(), 0)
  })
  for (const role of ["student", "professor", "admin"]) {
    await check(`${role} classroom form access`, { role }, async (page) => {
      await page.goto(`${home}/classrooms/new`, { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { level: 1 }).waitFor()
      assert.equal(await page.locator("#create-classroom-form").count(), role === "student" ? 0 : 1)
      if (role === "student") await capture(page, "student-classroom-access.png")
    })
  }
  await check("active TAs can approve and remove", { ta: true }, async (page, calls) => {
    await page.goto(`${home}/classrooms/class-1`, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Approve Sam", exact: true }).waitFor()
    assert.equal(await page.getByRole("button", { name: /Promote .* to TA/ }).count(), 0)
    await capture(page, "classroom-ta-and-anonymous-petition.png")
    await page.getByRole("button", { name: "Approve Sam", exact: true }).click()
    await page.getByRole("button", { name: "Remove Jo from classroom", exact: true }).click()
    assert.ok(calls.some((call) => call.action === "approve_membership"))
    assert.ok(calls.some((call) => call.action === "remove_from_classroom"))
    assert.equal(await page.getByRole("button", { name: "Archive", exact: true }).count(), 0)
  })
  for (const status of ["pending", "removed"]) {
    await check(`${status} TAs have no membership controls`, { ta: true, status }, async (page) => {
      await page.goto(`${home}/classrooms/class-1`, { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "Members (1)" }).waitFor()
      assert.equal(await page.getByRole("button", { name: /Approve|Remove .* from classroom/ }).count(), 0)
    })
  }
  await check("sign-in preserves shared petition destination", { guest: true, open: true }, async (page) => {
    const destination = `${home}/petitions/petition-1?shared=1#petition-comments`
    await page.goto(destination, { waitUntil: "domcontentloaded" })
    const link = page.locator('#petition-comments a[href^="/sign-in"]')
    await link.waitFor()
    const url = new URL(await link.getAttribute("href"), baseURL)
    assert.equal(url.searchParams.get("return_to"), destination)
  })
  await check("draft survives sign-in and clears after publication", { guest: true }, async (page, calls, signIn) => {
    await page.goto(`${home}/create?classroomId=class-1`, { waitUntil: "domcontentloaded" })
    await page.locator("#title").fill("Save our library")
    await page.locator("#description").fill("Keep the library open during finals.")
    await page.locator("#category").click()
    await page.getByRole("option", { name: "Campus", exact: true }).click()
    await page.locator("#goal").click()
    await page.getByRole("option", { name: "250 signatures", exact: true }).click()
    await page.locator("#petition-deadline").fill("2027-06-15T17:00")
    await page.locator("#petition-allow-comments").uncheck()
    await page.locator("#petition-anonymous").check()
    await page.locator('#create-petition-page a[href^="/sign-in"]').click({ noWaitAfter: true })
    await page.waitForURL("**/sign-in?**", { waitUntil: "domcontentloaded" })
    const destination = new URL(page.url()).searchParams.get("return_to")
    assert.equal(destination, `${home}/create?classroomId=class-1`)
    signIn()
    await page.goto(destination, { waitUntil: "domcontentloaded" })
    assert.equal(await page.locator("#title").inputValue(), "Save our library")
    assert.equal(await page.locator("#description").inputValue(), "Keep the library open during finals.")
    await page.locator("#publish-petition:enabled").waitFor()
    assert.equal(await page.locator("#petition-deadline").inputValue(), "2027-06-15T17:00")
    assert.equal(await page.locator("#petition-allow-comments").isChecked(), false)
    assert.equal(await page.locator("#petition-anonymous").isChecked(), true)
    await capture(page, "restored-petition-draft.png")
    await page.locator("#publish-petition").click()
    await page.locator("#petition-created").waitFor()
    const creation = calls.find((call) => call.action === "create_classroom_petition")
    assert.equal(creation.input.categoryId, "category-1")
    assert.equal(creation.input.goal, 250)
    assert.equal(creation.input.status, undefined)
    assert.equal(creation.input.allowComments, false)
    assert.equal(creation.input.isAnonymous, true)
    assert.ok(creation.input.deadline)
    await page.goto(destination, { waitUntil: "domcontentloaded" })
    assert.equal(await page.locator("#title").inputValue(), "")
  })
  await check("drafts stay separate across public and classroom forms", { guest: true }, async (page) => {
    await page.goto(`${home}/create?classroomId=class-1`, { waitUntil: "domcontentloaded" })
    await page.locator("#title").fill("Classroom draft")
    await page.locator("#header-create-petition").click()
    await page.waitForURL(`${home}/create`)
    await page.waitForFunction(() => document.querySelector("#title")?.value === "")
    assert.equal(await page.locator("#title").inputValue(), "")
    await page.locator("#title").fill("Public draft")
    await page.goBack({ waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => document.querySelector("#title")?.value === "Classroom draft")
    assert.equal(await page.locator("#title").inputValue(), "Classroom draft")
  })
  await check("draft storage failures leave the form usable", { guest: true }, async (page) => {
    await page.addInitScript(() => {
      for (const method of ["getItem", "setItem", "removeItem"]) {
        Storage.prototype[method] = () => { throw new DOMException("Unavailable", "SecurityError") }
      }
    })
    await page.goto(`${home}/create`, { waitUntil: "domcontentloaded" })
    await page.locator("#title").fill("My idea")
    assert.equal(await page.locator("#title").inputValue(), "My idea")
  })
  await check("bottom CTA resets scroll and focuses content", {}, async (page) => {
    await page.goto(home, { waitUntil: "domcontentloaded" })
    await page.locator("#landing-closing-create").scrollIntoViewIfNeeded()
    assert.ok(await page.evaluate(() => scrollY > 100))
    await page.locator("#landing-closing-create").click()
    await page.locator("#create-petition-form").waitFor()
    assert.equal(await page.evaluate(() => scrollY), 0)
    assert.equal(await page.evaluate(() => document.activeElement?.id), "main-content")
  })
  await check("signing refreshes cached classroom cards", { open: true }, async (page, calls) => {
    await page.goto(`${home}/classrooms/class-1`, { waitUntil: "domcontentloaded" })
    await page.locator("#petition-petition-1").click()
    await page.locator("#sign-petition").click()
    await page.getByText("Your signature is counted.", { exact: false }).waitFor()
    assert.equal(calls.find((call) => call.action === "create_signature").input.userId, undefined)
    await page.goBack()
    await page.waitForFunction(() => document.querySelector("#petition-petition-1 strong")?.textContent === "4", { timeout: 4000 })
  })
  await check("creation refreshes cached classroom list counts", {}, async (page) => {
    await page.goto(`${home}/classrooms`, { waitUntil: "domcontentloaded" })
    await page.locator(`a[href="${home}/classrooms/class-1"]`).first().click()
    await page.locator(`a[href="${home}/create?classroomId=class-1"]`).first().click()
    await page.locator("#title").fill("Another idea")
    await page.locator("#description").fill("A change for our classroom.")
    await page.locator("#category").click()
    await page.getByRole("option", { name: "Campus", exact: true }).click()
    await page.locator("#publish-petition").click()
    await page.locator("#petition-created").waitFor()
    await page.locator(`#app-header a[href="${home}/classrooms"]`).click()
    await page.getByText("2 petitions", { exact: false }).waitFor()
  })
} finally { await browser.close() }
if (failures) process.exitCode = 1
