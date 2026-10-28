import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { mutatePetition } from "../js/features/petition/petition-mutations.ts"

// The API client keeps the `fetch` it first sees, so one stub forwards to each test's server.
let respond
const originalDocument = globalThis.document
const originalLocation = globalThis.location
globalThis.fetch = (url, init) => respond(url, init)
afterEach(() => {
  globalThis.document = originalDocument
  globalThis.location = originalLocation
})

const petition = { id: "petition-1", classroomId: "classroom-1" }
const allKeys = [
  ["petition", petition.id, true],
  ["petition", petition.id, false],
  ["petitions", { sort: "newest" }],
  ["dashboardUser", "user-1"],
  ["classroomPetitions", petition.classroomId],
  ["classroom", petition.classroomId],
  ["myClassrooms"],
  ["petition", "other-petition"],
  ["classroomPetitions", "other-classroom"],
  ["categories"],
]
const input = { title: "A better campus", categoryId: "category-1" }
const cases = [
  { command: { kind: "create", input }, action: "createPetition", affected: [2, 3] },
  {
    command: { kind: "create", input, classroomId: petition.classroomId },
    action: "createClassroomPetition",
    affected: [2, 3, 4, 5, 6],
  },
  { command: { kind: "comment", petition, text: "I agree" }, action: "createComment" },
  { command: { kind: "sign", petition, reason: "  " }, action: "createSignature" },
  { command: { kind: "withdraw", petition }, action: "deleteSignature", returns: "nothing" },
  { command: { kind: "edit", petition, input: { title: "New title" } }, action: "updatePetition" },
  {
    command: { kind: "update", petition, input: { title: "News", body: "We did it" } },
    action: "createUpdate",
  },
  { command: { kind: "close", petition }, action: "closePetition" },
  { command: { kind: "victory", petition }, action: "markPetitionVictory" },
]

const insertedAt = "2026-10-01T12:00:00.000Z"
const petitionDto = {
  id: "result-1",
  title: "A better campus",
  description: "More benches",
  status: "open",
  classroomId: null,
  organizationId: null,
  hasSigned: false,
  canManage: true,
  goal: 100,
  signaturesCount: 0,
  daysLeft: 0,
  trending: false,
  author: "Ada Lovelace",
  allowComments: true,
  isAnonymous: false,
  deadline: null,
  insertedAt,
  categoryId: "category-1",
  category: { id: "category-1", name: "Campus", color: null },
}
const results = {
  deleteSignature: null,
  createComment: {
    id: "result-1",
    petitionId: petition.id,
    parentCommentId: null,
    text: "I agree",
    author: "Ada Lovelace",
    insertedAt,
    canEdit: true,
  },
  createSignature: {
    id: "result-1",
    petitionId: petition.id,
    reason: null,
    isVerified: false,
    insertedAt,
  },
  createUpdate: {
    id: "result-1",
    petitionId: petition.id,
    title: "News",
    body: "We did it",
    insertedAt,
  },
}

// Answers like the server's `POST /rpc` endpoint: one exit per request, in Effect's JSON form.
const exitFor = (request, failure) => ({
  _tag: "Exit",
  requestId: request.id,
  exit: failure
    ? { _tag: "Failure", cause: [{ _tag: "Fail", error: failure(request.tag) }] }
    : { _tag: "Success", value: request.tag in results ? results[request.tag] : petitionDto },
})

function setup(failure) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  for (const key of allKeys) client.setQueryData(key, { cached: true })
  const requests = []
  globalThis.document = {
    querySelector: () => ({ getAttribute: () => "csrf-token" }),
  }
  // The client resolves `/rpc` against the page, as in a browser.
  globalThis.location = new URL("http://localhost:5173/")
  respond = async (url, init) => {
    const body = JSON.parse(new TextDecoder().decode(init.body))
    requests.push({ url: String(url), method: init.method, headers: init.headers, body })
    return Response.json([exitFor(body, failure)])
  }
  return { client, requests }
}

// Close and victory can only be refused with one message; the other writes can name fields.
const refusal = (tag) =>
  ["closePetition", "markPetitionVictory"].includes(tag)
    ? { _tag: "Forbidden", message: "Not allowed." }
    : {
        _tag: "Invalid",
        message: "Invalid",
        fields: [
          { field: "petitionId", message: "Not allowed." },
          { field: "petitionId", message: "Please try later." },
        ],
      }

for (const { command, action, affected = [0, 1, 2, 3, 4], returns } of cases) {
  test(`${action}: sends CSRF and refreshes only related cached projections`, async () => {
    const { client, requests } = setup()
    const data = await mutatePetition(client, command)
    if (returns === "nothing") assert.equal(data, undefined)
    else assert.equal(data.id, "result-1")
    assert.equal(requests.length, 1)
    const request = requests[0]
    assert.match(request.url, /\/rpc\/?$/)
    assert.equal(request.method, "POST")
    assert.equal(request.headers["x-csrf-token"], "csrf-token")
    assert.equal(request.body.tag, action)
    const payload = request.body.payload
    if (["edit", "close", "victory"].includes(command.kind)) assert.equal(payload.id, petition.id)
    if (["sign", "withdraw", "comment", "update"].includes(command.kind))
      assert.equal(payload.petitionId, petition.id)
    if (command.classroomId) assert.equal(payload.classroomId, command.classroomId)
    if (command.kind === "sign") assert.equal(payload.reason, null)
    allKeys.forEach((key, index) => {
      assert.equal(
        client.getQueryState(key).isInvalidated,
        affected.includes(index),
        JSON.stringify(key),
      )
    })
    client.clear()
  })

  test(`${action}: rejected writes preserve the cache and show server errors`, async () => {
    const { client } = setup(refusal)
    const message = ["comment", "sign", "withdraw", "close", "victory"].includes(command.kind)
      ? "Not allowed."
      : "Not allowed. Please try later."
    await assert.rejects(mutatePetition(client, command), { message })
    for (const key of allKeys) assert.equal(client.getQueryState(key).isInvalidated, false)
    client.clear()
  })
}

test("transport failure preserves the cache and creation's connection guidance", async () => {
  const { client } = setup()
  respond = async () => {
    throw new TypeError("Failed to fetch")
  }
  await assert.rejects(mutatePetition(client, { kind: "create", input }), {
    message: "Your petition couldn't be created. Check your connection and try again.",
  })
  for (const key of allKeys) assert.equal(client.getQueryState(key).isInvalidated, false)
  client.clear()
})

test("an unreadable response shows the generic message, not the decoder's", async () => {
  const { client } = setup()
  respond = async (url, init) => {
    const { id } = JSON.parse(new TextDecoder().decode(init.body))
    return Response.json([{ _tag: "Exit", requestId: id, exit: {} }])
  }
  await assert.rejects(mutatePetition(client, { kind: "close", petition }), {
    message: "Your change couldn't be saved. Please try again.",
  })
  client.clear()
})

test("public participation does not refresh classroom projections", async () => {
  const { client } = setup()
  await mutatePetition(client, {
    kind: "sign",
    petition: { id: petition.id },
    reason: " More space ",
  })
  assert.equal(client.getQueryState(allKeys[0]).isInvalidated, true)
  assert.equal(client.getQueryState(allKeys[4]).isInvalidated, false)
  client.clear()
})

for (const kind of ["close", "withdraw", "comment"]) {
  test(`${kind}: preserves completion timing while active detail queries refresh`, async () => {
    const { client } = setup()
    let finishRefresh
    const refresh = new Promise((resolve) => {
      finishRefresh = resolve
    })
    const observer = new QueryObserver(client, {
      queryKey: allKeys[0],
      queryFn: () => refresh,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    let completed = false
    const mutation = mutatePetition(client, { kind, petition, text: "Yes" }).then(() => {
      completed = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(completed, kind === "comment")
    finishRefresh({ refreshed: true })
    await mutation
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(completed, true)
    assert.deepEqual(client.getQueryData(allKeys[0]), { refreshed: true })
    unsubscribe()
    client.clear()
  })
}
