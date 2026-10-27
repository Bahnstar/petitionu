import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { mutatePetition } from "../js/features/petition/petition-mutations.ts"

const originalFetch = globalThis.fetch
const originalDocument = globalThis.document
afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.document = originalDocument
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
  { command: { kind: "create", input }, action: "create_petition", affected: [2, 3] },
  {
    command: { kind: "create", input, classroomId: petition.classroomId },
    action: "create_classroom_petition",
    affected: [2, 3, 4, 5, 6],
  },
  { command: { kind: "comment", petition, text: "I agree" }, action: "create_comment" },
  { command: { kind: "sign", petition, reason: "  " }, action: "create_signature" },
  { command: { kind: "edit", petition, input: { title: "New title" } }, action: "update_petition" },
  {
    command: { kind: "update", petition, input: { title: "News", body: "We did it" } },
    action: "create_update",
  },
  { command: { kind: "close", petition }, action: "close_petition" },
  { command: { kind: "victory", petition }, action: "mark_petition_victory" },
]

function setup(response = { success: true, data: { id: "result-1" } }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  for (const key of allKeys) client.setQueryData(key, { cached: true })
  const requests = []
  globalThis.document = {
    querySelector: () => ({ getAttribute: () => "csrf-token" }),
  }
  globalThis.fetch = async (url, init) => {
    requests.push({ url, ...init, payload: JSON.parse(init.body) })
    return Response.json(response)
  }
  return { client, requests }
}

for (const { command, action, affected = [0, 1, 2, 3, 4] } of cases) {
  test(`${action}: sends CSRF and refreshes only related cached projections`, async () => {
    const { client, requests } = setup()
    assert.deepEqual(await mutatePetition(client, command), { id: "result-1" })
    assert.equal(requests.length, 1)
    const request = requests[0]
    assert.equal(request.url, "/rpc/run")
    assert.equal(request.method, "POST")
    assert.equal(request.headers["X-CSRF-Token"], "csrf-token")
    assert.equal(request.payload.action, action)
    assert.deepEqual(request.payload.fields, ["id"])
    if (["edit", "close", "victory"].includes(command.kind))
      assert.equal(request.payload.identity, petition.id)
    if (["sign", "comment", "update"].includes(command.kind))
      assert.equal(request.payload.input.petitionId, petition.id)
    if (command.classroomId) assert.equal(request.payload.input.classroomId, command.classroomId)
    if (command.kind === "sign") assert.equal(request.payload.input.reason, null)
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
    const { client } = setup({
      success: false,
      errors: [{ message: "Not allowed." }, { message: "Please try later." }],
    })
    const message = ["comment", "sign"].includes(command.kind)
      ? "Not allowed."
      : "Not allowed. Please try later."
    await assert.rejects(mutatePetition(client, command), { message })
    for (const key of allKeys) assert.equal(client.getQueryState(key).isInvalidated, false)
    client.clear()
  })
}

test("transport failure preserves the cache and creation's connection guidance", async () => {
  const { client } = setup()
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch")
  }
  await assert.rejects(mutatePetition(client, { kind: "create", input }), {
    message: "Your petition couldn't be created. Check your connection and try again.",
  })
  for (const key of allKeys) assert.equal(client.getQueryState(key).isInvalidated, false)
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

for (const kind of ["close", "comment"]) {
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
