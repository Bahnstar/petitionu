import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright")
const baseURL = process.env.BASE_URL || "http://localhost:4001"
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "MVP acceptance requires a local server")
const fixtures = JSON.parse(await readFile(process.env.MVP_FIXTURES || "/tmp/petitionu-mvp-fixtures.json", "utf8"))
const screenshotDir = process.env.SCREENSHOT_DIR || "docs/mvp/screenshots"
const runId = process.env.MVP_RUN_ID || Date.now().toString(36)
const home = "/ash-typescript"
const browser = await chromium.launch()
const contexts = []
const results = []
const scenario = {}
let activePage
let activeStep

async function capture(page, name) {
  await mkdir(screenshotDir, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(screenshotDir, name), fullPage: true, animations: "disabled", style: "#tidewave-toolbar, #phx-live-reload { display: none !important; }" })
}

async function account() {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  await context.routeWebSocket(/\/phoenix\/live_reload\/socket\//, (socket) => socket.close())
  contexts.push(context)
  const page = await context.newPage()
  page.on("response", async (response) => {
    if (response.status() >= 500 && new URL(response.url()).pathname === "/rpc/run") {
      const action = response.request().postDataJSON()?.action
      const title = (await response.text()).match(/<title>([^<]+)<\/title>/)?.[1]
      console.error(`SERVER ${response.status()} ${action}: ${title || "RPC request failed"}`)
    }
  })
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(90000)
  return page
}

async function step(name, page, run) {
  activePage = page
  activeStep = name
  console.log(`RUN ${name}`)
  await run()
  results.push({ name, status: "passed" })
  console.log(`PASS ${name}`)
}

async function poll(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(message)
}

async function rpc(page, action, params = {}) {
  return page.evaluate(async ({ action, params }) => {
    const token = document.querySelector('meta[name="csrf-token"]')?.content
    const response = await fetch("/rpc/run", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify({ action, ...params }) })
    if (!response.ok) throw new Error(`RPC ${action} returned HTTP ${response.status}`)
    return response.json()
  }, { action, params })
}

async function read(page, action, params) {
  const result = await rpc(page, action, params)
  assert.equal(result.success, true, `${action}: ${JSON.stringify(result.errors)}`)
  return result.data
}

async function waitForLiveView(page) {
  await page.locator("[data-phx-main].phx-connected").waitFor()
}

async function signIn(page, { email, password }) {
  await page.goto(`/sign-in?return_to=${encodeURIComponent(`${home}/profile`)}`)
  await waitForLiveView(page)
  await page.locator('#user-password-sign-in-with-password_email').fill(email)
  await page.locator('#user-password-sign-in-with-password_password').fill(password)
  await page.locator("#user-password-sign-in-with-password").getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(`**${home}/profile`)
  await page.locator("#profile-form").waitFor()
}

async function register(page, key, firstName, lastName) {
  const email = `${key}-${runId}@${fixtures.north.domain}`
  await page.goto(`/register?return_to=${encodeURIComponent(`${home}/profile`)}`)
  await waitForLiveView(page)
  await page.locator('#user-password-register-with-password_email').fill(email)
  await page.locator('#user-password-register-with-password_password').fill(fixtures.password)
  await page.locator('#user-password-register-with-password_password_confirmation').fill(fixtures.password)
  await page.getByRole("button", { name: "Create account", exact: true }).click()

  const confirmation = await poll(async () => {
    const response = await page.request.get("/dev/mailbox/json")
    assert.equal(response.status(), 200, "Local mailbox must be available")
    const { data } = await response.json()
    const mail = data.find((item) => item.to.some((recipient) => recipient.includes(email)) && item.subject === "Confirm your email address")
    return mail?.html_body.match(/href="([^"]+\/confirm_new_user\/[^\"]+)"/)?.[1]
  }, `No confirmation email delivered for ${email}`)

  const url = new URL(confirmation)
  await page.goto(url.pathname + url.search)
  await waitForLiveView(page)
  await page.getByRole("button", { name: /confirm/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/confirm_new_user/"))
  await page.goto(`${home}/profile`)
  if (await page.getByRole("link", { name: "Sign in", exact: true }).count() && !(await page.locator("#profile-form").count())) {
    await signIn(page, { email, password: fixtures.password })
  }
  await page.locator("#profile-form").waitFor()
  const before = await read(page, "get_me", { fields: ["id", "emailVerified", "profileComplete"] })
  assert.equal(before.emailVerified, true)
  assert.equal(before.profileComplete, false)
  await page.locator("#profile-first-name").fill(firstName)
  await page.locator("#profile-last-name").fill(lastName)
  await page.getByRole("button", { name: "Save profile", exact: true }).click()
  await page.getByText("Your profile is saved.", { exact: false }).waitFor()
  await page.reload()
  await page.locator("#profile-form").waitFor()
  const user = await read(page, "get_me", { fields: ["id", "firstName", "lastName", "emailVerified", "profileComplete", "organizationId", { organization: ["name"] }] })
  assert.equal(user.profileComplete, true)
  assert.equal(user.organizationId, fixtures.north.id)
  assert.equal(user.organization.name, fixtures.north.name)
  assert.equal(user.firstName, firstName)
  return user
}

async function createPetition(page, title) {
  await page.goto(`${home}/create`)
  await page.locator("#title").fill(title)
  await page.locator("#description").fill("Keep study spaces open until midnight during finals. Students need a safe, quiet place to finish their work, with accessible entrances and reliable transport home.")
  await page.locator("#category").click()
  await page.getByRole("option", { name: fixtures.category.name, exact: true }).click()
  await page.locator("#publish-petition:enabled").click()
  await page.locator("#petition-created").waitFor()
  await page.locator("#view-created-petition").click()
  await page.locator("#petition-owner-controls").waitFor()
  return page.url().split("/").at(-1)
}

try {
  const owner = await account()
  const signer = await account()
  const professor = await account()
  const admin = await account()
  const outsider = await account()
  const guest = await account()
  let ownerUser
  let signerUser
  let petitionId
  let classroomId
  let joinCode
  const title = "Keep our library open later"
  const editedTitle = "Extend library hours during finals"

  await step("register, confirm and complete profile", owner, async () => {
    ownerUser = await register(owner, "owner", "Alex", "Morgan")
    scenario.ownerId = ownerUser.id
    await capture(owner, "profile-desktop.png")
    await owner.setViewportSize({ width: 390, height: 844 })
    await capture(owner, "profile-mobile.png")
    await owner.setViewportSize({ width: 1440, height: 1000 })
  })

  await step("second student onboarding", signer, async () => {
    signerUser = await register(signer, "signer", "Sam", "Patel")
    scenario.signerId = signerUser.id
  })

  await step("create petition", owner, async () => {
    petitionId = await createPetition(owner, title)
    scenario.petitionId = petitionId
    assert.match(await owner.locator("#petition-detail-page").innerText(), /Started by Alex Morgan/)
    await capture(owner, "petition-owner-desktop.png")
  })

  await step("sign and comment persist", signer, async () => {
    await signer.goto(`${home}/petitions/${petitionId}`)
    await signer.locator("#sign-petition").waitFor()
    assert.equal(await signer.locator("#petition-owner-controls").count(), 0)
    assert.match(await signer.locator("#petition-detail-page").innerText(), /Started by Alex Morgan/)
    await signer.locator("#signature-reason").fill("A quiet place to study helps commuter students stay on track.")
    await signer.locator("#sign-petition").click()
    await signer.getByText("Your signature is counted.", { exact: false }).waitFor()
    await signer.locator("#petition-comment").fill("Please include weekend hours and an accessible entrance.")
    await signer.locator("#post-comment").click()
    await signer.getByText("Please include weekend hours and an accessible entrance.", { exact: true }).waitFor()
    await signer.reload()
    await signer.getByText("Your signature is counted.", { exact: false }).waitFor()
    const [petition] = await read(signer, "get_petitions", { filter: { id: { eq: petitionId } }, fields: ["id", "hasSigned", "signaturesCount", { comments: ["text", "author"] }] })
    assert.equal(petition.hasSigned, true)
    assert.equal(petition.signaturesCount, 1)
    assert.ok(petition.comments.some((comment) => comment.author === "Sam Patel"))
    await capture(signer, "petition-signed-desktop.png")
    await signer.setViewportSize({ width: 390, height: 844 })
    await capture(signer, "petition-signed-mobile.png")
    assert.ok(await signer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Petition page must fit a phone viewport")
    await signer.setViewportSize({ width: 1440, height: 1000 })
  })

  await step("campus browsing and public link", outsider, async () => {
    await signIn(outsider, fixtures.accounts.outsider)
    await outsider.goto(`${home}/petitions`)
    await outsider.getByText(/^\d+ petitions? to explore$/).waitFor()
    assert.equal(await outsider.locator("#my-campus").getAttribute("aria-pressed"), "true")
    assert.equal(await outsider.locator(`#petition-${petitionId}`).count(), 0)
    await outsider.locator("#all-campuses").click()
    await outsider.locator(`#petition-${petitionId}`).waitFor()
    await guest.goto(`${home}/petitions/${petitionId}`)
    await guest.getByRole("heading", { name: title, exact: true }).waitFor()
    assert.match(await guest.locator("#petition-detail-page").innerText(), /Started by Alex Morgan/)
  })

  await step("edit petition and protect anonymous ownership", owner, async () => {
    await owner.reload()
    await owner.locator("#edit-petition").click()
    await owner.locator("#edit-petition-title").fill(editedTitle)
    await owner.locator("#edit-petition-anonymous").check()
    await owner.locator("#confirm-petition-edit").click()
    await owner.getByRole("heading", { name: editedTitle, exact: true }).waitFor()
    await guest.reload()
    await guest.getByRole("heading", { name: editedTitle, exact: true }).waitFor()
    assert.match(await guest.locator("#petition-detail-page").innerText(), /Started by Anonymous/)
    assert.doesNotMatch(await guest.locator("#petition-detail-page").innerText(), /Alex Morgan/)
    const users = await read(guest, "get_users", { fields: ["id", { petitions: ["id"] }] })
    assert.deepEqual(users, [])
    const ownerActivity = await rpc(guest, "get_user_by_id", {
      input: { id: ownerUser.id, includeStats: true },
      fields: ["id", "numPetitions", "numSigned", { petitions: ["id"] }, { signatures: ["id"] }],
    })
    assert.equal(ownerActivity.data ?? null, null)
    await capture(guest, "petition-anonymous-desktop.png")
  })

  await step("publish update, close and mark victory", owner, async () => {
    await owner.locator("#add-petition-update").click()
    await owner.locator("#petition-update-title").fill("The library team is listening")
    await owner.locator("#petition-update-body").fill("We met with campus staff and shared the need for longer finals week hours.")
    await owner.locator("#confirm-petition-update").click()
    await owner.getByText("The library team is listening", { exact: true }).waitFor()
    await owner.locator("#close-petition").click()
    await owner.locator("#confirm-petition-close").click()
    await poll(async () => (await read(owner, "get_petitions", { filter: { id: { eq: petitionId } }, fields: ["status"] }))[0]?.status === "closed", "Petition did not close")
    await owner.locator("#mark-petition-victory").click()
    await owner.locator("#confirm-petition-victory").click()
    await poll(async () => (await read(owner, "get_petitions", { filter: { id: { eq: petitionId } }, fields: ["status"] }))[0]?.status === "victory", "Petition did not reach victory")
    await owner.reload()
    await owner.getByRole("heading", { name: editedTitle, exact: true }).waitFor()
    await capture(owner, "petition-victory-desktop.png")
  })

  await step("professor creates classroom", professor, async () => {
    await signIn(professor, fixtures.accounts.professor)
    await professor.goto(`${home}/classrooms/new`)
    await professor.locator("#name").fill("Campus change seminar")
    await professor.locator("#description").fill("Practice turning shared concerns into constructive campus proposals.")
    await professor.getByRole("button", { name: "Create classroom", exact: true }).click()
    await professor.waitForURL(/\/classrooms\/[0-9a-f-]+$/)
    classroomId = professor.url().split("/").at(-1)
    scenario.classroomId = classroomId
    const classroom = await read(professor, "get_classroom_by_id", { input: { id: classroomId }, fields: ["id", "joinCode", "name"] })
    joinCode = classroom.joinCode
    assert.ok(joinCode)
  })

  await step("join classroom and display TA members", signer, async () => {
    for (const page of [signer, owner]) {
      await page.goto(`${home}/classrooms`)
      await page.locator("#join-code").fill(joinCode)
      await page.locator('#join-classroom-form button[type="submit"]').click()
      await page.getByText("You’ve joined", { exact: false }).waitFor()
    }
    await professor.reload()
    await professor.getByRole("button", { name: "Promote Sam Patel to TA", exact: true }).click()
    await professor.getByRole("button", { name: "Demote Sam Patel to student", exact: true }).waitFor()
    await signer.goto(`${home}/classrooms/${classroomId}`)
    await signer.getByRole("button", { name: "Remove Alex Morgan from classroom", exact: true }).waitFor()
    assert.match(await signer.locator("main").innerText(), /Sam Patel/)
    await capture(signer, "classroom-ta-desktop.png")
    await signer.getByRole("button", { name: "Remove Alex Morgan from classroom", exact: true }).click()
    await poll(async () => (await read(signer, "get_memberships_for_classroom", { input: { classroomId }, fields: ["userId", "status"] })).some((membership) => membership.userId === ownerUser.id && membership.status === "removed"), "TA removal did not persist")
    await owner.goto(`${home}/classrooms`)
    await owner.locator("#join-code").fill(joinCode)
    await owner.locator('#join-classroom-form button[type="submit"]').click()
    await owner.locator("#join-code-error").waitFor()
  })

  let reportId
  let supportRequests

  await step("report content through the petition page", signer, async () => {
    await signer.goto(`${home}/petitions/${petitionId}`)
    await signer.getByRole("button", { name: "Report petition", exact: true }).click()
    await signer.getByRole("radio", { name: "Other concern", exact: true }).check()
    await signer.getByLabel("Details, optional", { exact: true }).fill("Please review this synthetic acceptance example for the campus content rules.")
    await signer.getByRole("button", { name: "Submit report", exact: true }).click()
    await signer.getByText("Report received. A moderator can review it.", { exact: true }).waitFor()
    const reports = await read(signer, "get_content_reports", { fields: ["id", "state"], filter: { petitionId: { eq: petitionId } } })
    assert.equal(reports.length, 1)
    assert.equal(reports[0].state, "open")
    reportId = reports[0].id
  })

  await step("moderator reviews and hides reported content", admin, async () => {
    await signIn(admin, fixtures.accounts.admin)
    await admin.goto(`${home}/moderation`)
    const note = admin.locator(`#report-note-${reportId}`)
    await note.waitFor()
    const article = admin.locator("article").filter({ has: note })
    await article.getByRole("checkbox", { name: /Hide reported content/ }).check()
    await note.fill("Reviewed the synthetic example and removed it from public browsing.")
    await capture(admin, "moderation-desktop.png")
    await article.getByRole("button", { name: "Save decision", exact: true }).click()
    await admin.getByText("Decision saved.", { exact: true }).waitFor()
    await poll(async () => (await read(signer, "get_content_reports", { fields: ["id", "state"], filter: { id: { eq: reportId } } }))[0]?.state === "resolved", "Moderation decision did not persist")
    await guest.reload()
    const petitions = await read(guest, "get_petitions", { fields: ["id"], filter: { id: { eq: petitionId } } })
    assert.deepEqual(petitions, [])
    await guest.getByRole("heading", { name: "We couldn't find that petition.", exact: true }).waitFor()
  })

  await step("submit support and account deletion requests", signer, async () => {
    await signer.goto(`${home}/support`)
    await signer.locator("#support-message").fill("Please help me understand which campus services are available.")
    await signer.getByRole("button", { name: "Submit request", exact: true }).click()
    await signer.getByText("Request received. You can follow its status below.", { exact: true }).waitFor()
    await signer.getByRole("radio", { name: "Account deletion", exact: true }).check()
    await signer.locator("#support-message").fill("Please review deletion of this synthetic acceptance account.")
    await signer.getByRole("button", { name: "Submit request", exact: true }).click()
    await signer.getByText("Request received. You can follow its status below.", { exact: true }).waitFor()
    await signer.reload()
    await signer.getByText("Please review deletion of this synthetic acceptance account.", { exact: true }).waitFor()
    supportRequests = await read(signer, "get_my_support_requests", { fields: ["id", "kind", "state"] })
    assert.equal(supportRequests.length, 2)
    assert.ok(supportRequests.every((request) => request.state === "open"))
    await capture(signer, "support-desktop.png")
    await signer.setViewportSize({ width: 390, height: 844 })
    await capture(signer, "support-mobile.png")
    assert.ok(await signer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Support page must fit a phone viewport")
    await signer.setViewportSize({ width: 1440, height: 1000 })
  })

  await step("operator resolves requests without deleting the account", admin, async () => {
    await admin.goto(`${home}/moderation`)
    await admin.getByRole("button", { name: "Support requests", exact: true }).click()
    for (const request of supportRequests) {
      const note = admin.locator(`#support-note-${request.id}`)
      await note.fill("Reviewed this test request. No account or content was deleted.")
      await admin.locator("article").filter({ has: note }).getByRole("button", { name: "Resolve request", exact: true }).click()
      await note.waitFor({ state: "detached" })
    }
    await signer.reload()
    const requests = await read(signer, "get_my_support_requests", { fields: ["id", "state", "resolutionNote"] })
    assert.equal(requests.length, 2)
    assert.ok(requests.every((request) => request.state === "resolved"))
    assert.equal((await read(signer, "get_me", { fields: ["id"] })).id, signerUser.id)
    await capture(signer, "support-resolved-desktop.png")
    await outsider.goto(`${home}/moderation`)
    await outsider.getByText("This queue is available to campus administrators and platform operators.", { exact: true }).waitFor()
    assert.equal(await outsider.locator('button[type="submit"]').count(), 0)
  })

  await rm(join(screenshotDir, "failure.png"), { force: true })
  console.log(JSON.stringify({ runId, petitionId, classroomId, ownerId: ownerUser.id, signerId: signerUser.id, results }, null, 2))
} catch (error) {
  results.push({ name: activeStep, status: "failed", error: error.message, url: activePage?.url() })
  console.error(error)
  await Promise.all(contexts.map((context, index) => context.storageState({ path: `/tmp/petitionu-mvp-${runId}-session-${index}.json` })))
  if (activePage) await capture(activePage, "failure.png")
  process.exitCode = 1
} finally {
  await writeFile(process.env.MVP_REPORT || "/tmp/petitionu-mvp-browser-report.json", JSON.stringify({ runId, ...scenario, results }, null, 2))
  await Promise.all(contexts.map((context) => context.close()))
  await browser.close()
}
