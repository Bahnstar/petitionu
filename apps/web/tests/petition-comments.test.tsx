import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import type { MeDto, PetitionDetailDto } from "@petitionu/domain"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const petitionId = "00000000-0000-4000-8000-000000000001"
const firstId = "00000000-0000-4000-8000-000000000011"
const replyId = "00000000-0000-4000-8000-000000000012"
const secondId = "00000000-0000-4000-8000-000000000013"
const goneId = "00000000-0000-4000-8000-000000000014"
const orphanId = "00000000-0000-4000-8000-000000000015"
const insertedAt = "2026-10-01T12:00:00.000000Z"

// As sent: the client decodes them.
type Petition = typeof PetitionDetailDto.Encoded
type Comment = Petition["comments"][number]

const comment = (id: string, text: string, overrides: Partial<Comment> = {}): Comment => ({
  id,
  parentCommentId: null,
  text,
  insertedAt,
  author: "Ada Lovelace",
  canEdit: false,
  ...overrides,
})

interface CreateCommentPayload {
  readonly petitionId: string
  readonly text: string
  readonly parentCommentId?: string
}

const conversation = () => [
  comment(firstId, "The first comment"),
  comment(secondId, "The second comment"),
  comment(replyId, "A reply to the first", {
    parentCommentId: firstId,
    author: "Grace Hopper",
    canEdit: true,
  }),
  comment(orphanId, "A reply to a removed comment", { parentCommentId: goneId }),
]

const user: typeof MeDto.Encoded = {
  id: "user-1",
  email: "ada@school.edu",
  firstName: "Ada",
  lastName: "Lovelace",
  role: "student",
  insertedAt,
  graduationYear: null,
  emailVerified: true,
  profileComplete: true,
  organizationId: null,
  organization: null,
  hasPassword: true,
}

let comments = conversation()
let petitionOverrides: Partial<Petition> = {}
let refusal: { field: string; message: string; removes?: string } | null = null
let heldPosts: Promise<void> | null = null
let replies: Array<CreateCommentPayload> = []
/** A write fails in transit: its request never gets an answer the client can read. */
let dropWrites = false
/** The session ended in another tab: only a reloaded token gets past the server's CSRF check. */
let sessionEnded = false
let csrfCalls = 0
let refusedCalls: string[] = []

const petition = (): Petition => ({
  id: petitionId,
  title: "A better campus",
  description: "More benches",
  status: "open",
  classroomId: null,
  organizationId: null,
  hasSigned: false,
  canManage: false,
  isAuthor: false,
  goal: 100,
  signaturesCount: 0,
  daysLeft: 10,
  trending: false,
  author: "Ada Lovelace",
  allowComments: true,
  isAnonymous: false,
  deadline: null,
  insertedAt,
  categoryId: "00000000-0000-4000-8000-000000000004",
  category: { id: "00000000-0000-4000-8000-000000000004", name: "Campus", color: null },
  ...petitionOverrides,
  comments,
  signatures: [],
  updates: [],
})

let petitionReads = 0
let client: InstanceType<typeof QueryClient>

function createComment(payload: CreateCommentPayload) {
  replies.push(payload)
  const created = comment("00000000-0000-4000-8000-000000000020", payload.text, {
    parentCommentId: firstId,
    canEdit: true,
  })
  comments = [...comments, created]
  return { ...created, petitionId }
}

function updateComment({ id, text }: { id: string; text: string }) {
  comments = comments.map((c) => (c.id === id ? { ...c, text } : c))
  return { ...comments.find((c) => c.id === id)!, petitionId }
}

function deleteComment({ id }: { id: string }) {
  comments = comments.filter((c) => c.id !== id)
  return null
}

function answer(tag: string, payload: never) {
  if (tag === "getMe") return user
  if (tag === "createComment") return createComment(payload)
  if (tag === "updateComment") return updateComment(payload)
  if (tag === "deleteComment") return deleteComment(payload)
  petitionReads += 1
  return petition()
}

const originalFetch = globalThis.fetch
// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.pathname === "/rpc/csrf-token") {
    csrfCalls += 1
    return Response.json({ token: "fresh-token" })
  }
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  const { id, tag, payload } = JSON.parse(await request.text())
  const refuse = (error: { _tag: string; message: string }) =>
    Response.json([
      {
        _tag: "Exit",
        requestId: id,
        exit: { _tag: "Failure", cause: [{ _tag: "Fail", error }] },
      },
    ])
  if (sessionEnded && request.headers.get("x-csrf-token") !== "fresh-token") {
    refusedCalls.push(tag)
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  if (sessionEnded && tag === "getMe") {
    return refuse({ _tag: "NotFound", message: "User not found" })
  }
  if (sessionEnded && tag === "getPetitionById") {
    return refuse({ _tag: "NotFound", message: "Not found" })
  }
  if (sessionEnded) return refuse({ _tag: "Unauthenticated", message: "Sign in to participate." })
  const write = tag === "createComment" || tag === "updateComment"
  if (write && heldPosts) await heldPosts
  if (write && dropWrites) throw new TypeError("Failed to fetch")
  if (write && refusal) {
    const { field, message, removes } = refusal
    comments = comments.filter((c) => c.id !== removes)
    const error = { _tag: "Invalid", message: "Invalid", fields: [{ field, message }] }
    const exit = { _tag: "Failure", cause: [{ _tag: "Fail", error }] }
    return Response.json([{ _tag: "Exit", requestId: id, exit }])
  }
  const exit = { _tag: "Success", value: answer(tag, payload) }
  return Response.json([{ _tag: "Exit", requestId: id, exit }])
}) as typeof fetch

const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { MemoryRouter, Route, Routes } = await import("react-router-dom")
const { AuthProvider } = await import("../js/contexts/auth-context.tsx")
const { default: PetitionIndexPage } = await import("../js/pages/petition-index-page.tsx")

afterAll(async () => {
  globalThis.fetch = originalFetch
  await GlobalRegistrator.unregister()
})

afterEach(() => {
  comments = conversation()
  petitionOverrides = {}
  refusal = null
  heldPosts = null
  replies = []
  dropWrites = false
  sessionEnded = false
  csrfCalls = 0
  refusedCalls = []
  document.body.innerHTML = ""
  document.head.innerHTML = ""
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

async function render(signedIn = user) {
  const container = document.createElement("div")
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["currentUser"], signedIn)
  const root = createRoot(container)
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/petitions/${petitionId}`]}>
            <Routes>
              <Route path="/petitions/:id" element={<PetitionIndexPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  )
  await settle()
  return container
}

/** The conversation's threads, each as the text of its comments in reading order. */
const threads = (container: HTMLElement) =>
  [...container.querySelectorAll(".petition-thread > div")].map((thread) =>
    [...thread.querySelectorAll("p.whitespace-pre-wrap, p.italic")].map((p) => p.textContent),
  )

/** The comment or reply showing `text`. */
function commentWith(container: HTMLElement, text: string) {
  const body = [...container.querySelectorAll("p")].find((p) => p.textContent === text)
  if (!body) throw new Error(`No comment says ${text}`)
  return body.parentElement!
}

const buttonIn = (element: Element, name: string) =>
  [...element.querySelectorAll("button")].find((button) => button.textContent === name)

async function click(button: HTMLElement | undefined) {
  if (!button) throw new Error("No such button")
  await act(() => button.click())
  await settle()
}

function typeReply(form: HTMLFormElement, value: string) {
  const textarea = form.querySelector("textarea")!
  // React tracks the input's value; set it through the native setter so onChange fires.
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
  setter.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

/** Holds posts back until the returned function is called. */
function holdPosts() {
  let release = () => {}
  heldPosts = new Promise((resolve) => {
    release = resolve
  })
  return async () => {
    release()
    await settle()
  }
}

async function reply(element: Element, text: string) {
  await click(buttonIn(element, "Reply"))
  const form = element.querySelector("form")!
  await act(() => typeReply(form, text))
  await act(() => form.requestSubmit())
  await settle()
  return form
}

test("replies sit flat under their parent, and a removed parent shows no content", async () => {
  const container = await render()
  expect(threads(container)).toEqual([
    ["The first comment", "A reply to the first"],
    ["The second comment"],
    ["This comment is no longer available.", "A reply to a removed comment"],
  ])
  const removed = container.querySelectorAll(".petition-thread > div")[2]!
  // Only the reply can be answered or reported: the notice stands for nothing the reader can use.
  expect(removed.querySelectorAll("button").length).toBe(2)
})

test("a reply to a comment names it, closes the form and appears in the thread", async () => {
  const container = await render()
  const first = commentWith(container, "The first comment")
  await click(buttonIn(first, "Reply"))
  const textarea = first.querySelector("textarea")!
  expect(document.activeElement).toBe(textarea)
  expect(first.querySelector("label")?.textContent).toBe("Reply to Ada Lovelace")

  await reply(commentWith(container, "The second comment"), "Agreed")
  expect(replies).toEqual([{ petitionId, text: "Agreed", parentCommentId: secondId }])
  const second = commentWith(container, "The second comment")
  expect(second.querySelector("form")).toBeNull()
  expect(document.activeElement).toBe(buttonIn(second, "Reply")!)
  expect(threads(container)[0]).toContain("Agreed")
})

test("a reply to a reply sends the reply's own id, so the server can check it", async () => {
  const container = await render()
  await reply(commentWith(container, "A reply to the first"), "Me too")
  expect(replies).toEqual([{ petitionId, text: "Me too", parentCommentId: replyId }])
})

test("Cancel closes the form without posting and returns to the Reply button", async () => {
  const container = await render()
  const first = commentWith(container, "The first comment")
  await click(buttonIn(first, "Reply"))
  await click(buttonIn(first, "Cancel"))
  expect(first.querySelector("form")).toBeNull()
  expect(document.activeElement).toBe(buttonIn(first, "Reply")!)
  expect(replies).toEqual([])
})

test("a refused reply keeps the form and the text, and shows the server's message", async () => {
  refusal = { field: "petitionId", message: "This petition is closed." }
  const container = await render()
  const form = await reply(commentWith(container, "The first comment"), "Too late")
  expect(form.querySelector("[role=alert]")?.textContent).toBe(refusal.message)
  expect(form.querySelector("textarea")?.value).toBe("Too late")
})

test("a refused reply shows a text error under the field, and the form keeps it", async () => {
  refusal = { field: "text", message: "must be present" }
  const container = await render()
  const form = await reply(commentWith(container, "The first comment"), "Too blank")
  const textarea = form.querySelector("textarea")!
  const error = form.querySelector(`#${CSS.escape(textarea.getAttribute("aria-describedby")!)}`)
  expect(error?.textContent).toBe("must be present")
  expect(textarea.getAttribute("aria-invalid")).toBe("true")
  expect(textarea.value).toBe("Too blank")
  expect(form.querySelectorAll("[role=alert]").length).toBe(1)
})

test("the Reply toggle can't close a pending post, whose failure keeps the text", async () => {
  refusal = { field: "petitionId", message: "This petition is closed." }
  const release = holdPosts()
  const container = await render()
  const first = commentWith(container, "The first comment")
  const form = await reply(first, "Keep me")

  const toggle = buttonIn(first, "Reply")!
  expect(toggle.getAttribute("aria-disabled")).toBe("true")
  await click(toggle)
  expect(first.querySelector("form")).toBe(form)
  expect(form.querySelector("textarea")?.readOnly).toBe(true)

  await release()
  expect(form.querySelector("[role=alert]")?.textContent).toBe(refusal.message)
  expect(form.querySelector("textarea")?.value).toBe("Keep me")
  expect(form.querySelector("textarea")?.readOnly).toBe(false)
  expect(toggle.getAttribute("aria-disabled")).toBe("false")
})

for (const name of ["Reply", "Cancel"]) {
  test(`${name} right after submitting, before the page shows the post, keeps the form`, async () => {
    refusal = { field: "petitionId", message: "This petition is closed." }
    const release = holdPosts()
    const container = await render()
    const first = commentWith(container, "The first comment")
    await click(buttonIn(first, "Reply"))
    const form = first.querySelector("form")!
    await act(() => typeReply(form, "Keep me"))

    await act(() => {
      form.requestSubmit()
      buttonIn(first, name)!.click()
    })
    await settle()
    expect(first.querySelector("form")).toBe(form)

    await release()
    expect(form.querySelector("[role=alert]")?.textContent).toBe(refusal.message)
    expect(form.querySelector("textarea")?.value).toBe("Keep me")
  })
}

test("a post's success leaves a newer draft alone", async () => {
  const release = holdPosts()
  const container = await render()
  const first = commentWith(container, "The first comment")
  await reply(first, "One")
  const second = commentWith(container, "The second comment")
  await click(buttonIn(second, "Reply"))
  await act(() => typeReply(second.querySelector("form")!, "Second draft"))

  await release()
  expect(replies).toEqual([{ petitionId, text: "One", parentCommentId: firstId }])
  expect(first.querySelector("form")).toBeNull()
  expect(second.querySelector("textarea")?.value).toBe("Second draft")
})

for (const [text, id] of [
  ["The first comment", firstId],
  ["The second comment", secondId],
] as const) {
  test(`a reply to a gone parent refetches and keeps its text: ${text}`, async () => {
    refusal = {
      field: "parentCommentId",
      message: "Reply to a comment in this petition.",
      removes: id,
    }
    const container = await render()
    const reads = petitionReads
    await reply(commentWith(container, text), "Too late")

    expect(petitionReads).toBe(reads + 1)
    expect(threads(container).flat()).not.toContain(text)
    const kept = container.querySelector<HTMLElement>("[role=alert]")!
    expect(kept.textContent).toContain("no longer available")
    expect(kept.querySelector("textarea")?.value).toBe("Too late")
    expect(document.activeElement).toBe(kept.querySelector("textarea"))

    await click(buttonIn(kept, "Dismiss"))
    expect(container.querySelector("[role=alert]")).toBeNull()
  })
}

test("a reply to a gone reply keeps its text, and its thread stays", async () => {
  refusal = {
    field: "parentCommentId",
    message: "Reply to a comment in this petition.",
    removes: replyId,
  }
  const container = await render()
  await reply(commentWith(container, "A reply to the first"), "Too late")
  expect(threads(container)[0]).toEqual(["The first comment"])
  expect(container.querySelector("[role=alert] textarea")?.textContent).toBe("Too late")
})

test("replies offer what comments do: edit for their author, report for everyone else", async () => {
  const container = await render()
  const own = commentWith(container, "A reply to the first")
  expect(buttonIn(own, "Edit")).toBeDefined()
  expect(buttonIn(own, "Report comment")).toBeUndefined()
  const other = commentWith(container, "A reply to a removed comment")
  expect(buttonIn(other, "Edit")).toBeUndefined()
  expect(buttonIn(other, "Report comment")).toBeDefined()
})

/** Takes `id` off the server's list and refetches the page, as any write on it would. */
async function removeComment(...ids: string[]) {
  comments = comments.filter((c) => !ids.includes(c.id))
  await act(() => client.invalidateQueries({ queryKey: ["petition"] }))
  await settle()
}

async function openForm(element: Element, name: "Reply" | "Edit", text?: string) {
  await click(buttonIn(element, name))
  const form = element.querySelector("form")!
  if (text !== undefined) await act(() => typeReply(form, text))
  return form
}

const notices = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[role=alert]")].filter((alert) =>
    alert.querySelector("textarea[readonly]"),
  )
const noticeTexts = (container: HTMLElement) =>
  notices(container).map((notice) => notice.querySelector("textarea")?.value)

test("an open reply's text moves to the notice when its comment leaves the page", async () => {
  const container = await render()
  await openForm(commentWith(container, "The first comment"), "Reply", "Half written")

  await removeComment(firstId)

  expect(noticeTexts(container)).toEqual(["Half written"])
  expect(notices(container)[0]?.textContent).toContain("your reply wasn’t posted")
  expect(document.activeElement).toBe(notices(container)[0]!.querySelector("textarea"))
})

test("an open edit's text moves to the notice, worded as an edit", async () => {
  const container = await render()
  await openForm(commentWith(container, "A reply to the first"), "Edit", "A better reply")

  await removeComment(replyId)

  expect(noticeTexts(container)).toEqual(["A better reply"])
  const notice = notices(container)[0]!
  expect(notice.textContent).toContain("The comment you were editing")
  expect(notice.textContent).toContain("your edit wasn’t saved")
  expect(notice.querySelector("label")?.textContent).toBe("Your edit")
})

test("posting a top-level comment keeps the text of a reply its refetch removes", async () => {
  const container = await render()
  await openForm(commentWith(container, "The second comment"), "Reply", "Half written")
  comments = comments.filter((c) => c.id !== secondId)

  const form = container.querySelector<HTMLFormElement>("#petition-comment-form")!
  await act(() => typeReply(form, "New thought"))
  await act(() => form.requestSubmit())
  await settle()

  expect(noticeTexts(container)).toEqual(["Half written"])
})

test("a refusal keeps the text of a second open draft that has also gone", async () => {
  const container = await render()
  await openForm(commentWith(container, "A reply to the first"), "Reply", "Second draft")
  comments = comments.filter((c) => c.id !== replyId)
  refusal = {
    field: "parentCommentId",
    message: "Reply to a comment in this petition.",
    removes: secondId,
  }

  await reply(commentWith(container, "The second comment"), "First draft")

  expect(noticeTexts(container).sort()).toEqual(["First draft", "Second draft"])
})

test("a comment leaving doesn't take focus from a form someone is typing in", async () => {
  const container = await render()
  await openForm(commentWith(container, "The first comment"), "Reply", "Half written")
  const other = commentWith(container, "The second comment")
  await openForm(other, "Reply", "Still typing")
  const typing = other.querySelector("textarea")!
  expect(document.activeElement).toBe(typing)

  await removeComment(firstId)

  expect(noticeTexts(container)).toEqual(["Half written"])
  expect(document.activeElement).toBe(typing)
})

for (const [why, text] of [
  ["is empty", ""],
  ["holds only spaces", "   "],
] as const) {
  test(`no notice when the open form ${why}`, async () => {
    const container = await render()
    await openForm(commentWith(container, "The first comment"), "Reply", text)

    await removeComment(firstId)

    expect(notices(container)).toEqual([])
  })
}

test("a form closed before its comment leaves leaves nothing behind", async () => {
  const container = await render()
  const first = commentWith(container, "The first comment")
  await openForm(first, "Reply", "Thought better of it")
  await click(buttonIn(first, "Cancel"))
  const own = commentWith(container, "A reply to the first")
  await openForm(own, "Edit", "Thought better of it too")
  await click(buttonIn(own, "Cancel"))

  await removeComment(firstId, replyId)

  expect(notices(container)).toEqual([])
})

test("deleting your own comment shows no notice", async () => {
  const container = await render()
  const own = commentWith(container, "A reply to the first")
  await click(buttonIn(own, "Delete"))

  await click(buttonIn(own, "Delete comment"))

  expect(threads(container).flat()).not.toContain("A reply to the first")
  expect(notices(container)).toEqual([])
})

test("a posted reply and a saved edit show no notice, then or on a later refetch", async () => {
  const container = await render()
  await reply(commentWith(container, "The second comment"), "Posted")
  const own = commentWith(container, "A reply to the first")
  const form = await openForm(own, "Edit", "Saved")
  await act(() => form.requestSubmit())
  await settle()

  await removeComment(secondId, replyId)

  expect(notices(container)).toEqual([])
})

test("two refusals on one comment are dismissed one at a time", async () => {
  refusal = { field: "parentCommentId", message: "Reply to a comment in this petition." }
  const container = await render()
  await reply(commentWith(container, "The first comment"), "One")
  await reply(commentWith(container, "The first comment"), "Two")
  expect(noticeTexts(container)).toEqual(["One", "Two"])

  await click(buttonIn(notices(container)[0]!, "Dismiss"))

  expect(noticeTexts(container)).toEqual(["Two"])
})

test("a post that lands after its comment left isn't reported as lost", async () => {
  const release = holdPosts()
  const container = await render()
  await reply(commentWith(container, "The second comment"), "Sent in time")

  await removeComment(secondId)
  expect(notices(container)).toEqual([])
  await release()

  expect(replies.map((payload) => payload.text)).toEqual(["Sent in time"])
  expect(notices(container)).toEqual([])
  await act(() => client.invalidateQueries({ queryKey: ["petition"] }))
  await settle()
  expect(notices(container)).toEqual([])
})

test("a post refused after its comment left is kept once", async () => {
  refusal = { field: "parentCommentId", message: "Reply to a comment in this petition." }
  const release = holdPosts()
  const container = await render()
  await reply(commentWith(container, "The second comment"), "Too late")

  await removeComment(secondId)
  await release()

  expect(noticeTexts(container)).toEqual(["Too late"])
})

test("a post that fails in transit after its comment left is still kept", async () => {
  dropWrites = true
  const release = holdPosts()
  const container = await render()
  await reply(commentWith(container, "The second comment"), "Lost in transit")

  await removeComment(secondId)
  await release()

  expect(noticeTexts(container)).toEqual(["Lost in transit"])
})

test("an edit that fails after its comment left is kept", async () => {
  const release = holdPosts()
  const container = await render()
  const form = await openForm(commentWith(container, "A reply to the first"), "Edit", "Reworded")
  await act(() => form.requestSubmit())
  await settle()
  dropWrites = true

  await removeComment(replyId)
  await release()
  expect(noticeTexts(container)).toEqual(["Reworded"])
})

const noReply: Array<[string, Partial<Petition>, typeof user]> = [
  ["the petition is closed", { status: "closed" }, user],
  ["comments are turned off", { allowComments: false }, user],
  ["the profile is incomplete", {}, { ...user, profileComplete: false }],
]
const stopped: Array<[string, Partial<Petition>]> = [
  ["closes", { status: "closed" }],
  ["turns comments off", { allowComments: false }],
  ["passes its deadline", { deadline: "2026-01-01T00:00:00.000000Z" }],
]
for (const [why, overrides] of stopped) {
  test(`an open form goes read-only and keeps its text when the petition ${why}`, async () => {
    const container = await render()
    const first = commentWith(container, "The first comment")
    await click(buttonIn(first, "Reply"))
    const form = first.querySelector("form")!
    await act(() => typeReply(form, "Half written"))
    expect(form.querySelector("[role=status]")).toBeNull()

    petitionOverrides = overrides
    await act(() => client.invalidateQueries({ queryKey: ["petition"] }))
    await settle()

    expect(first.querySelector("form")).toBe(form)
    expect(form.querySelector("[role=status]")?.textContent).toBe(
      "This petition is no longer accepting replies.",
    )
    const textarea = form.querySelector("textarea")!
    expect(textarea.value).toBe("Half written")
    expect(textarea.readOnly).toBe(true)
    expect(buttonIn(form, "Post reply")?.disabled).toBe(true)

    await act(() => form.requestSubmit())
    await settle()
    expect(replies).toEqual([])

    await click(buttonIn(form, "Cancel"))
    expect(first.querySelector("form")).toBeNull()
    expect(buttonIn(first, "Reply")).toBeUndefined()
  })
}

for (const [why, overrides, signedIn] of noReply) {
  test(`no Reply when ${why}, and the replies stay readable`, async () => {
    petitionOverrides = overrides
    const container = await render(signedIn)
    expect(threads(container)[0]).toEqual(["The first comment", "A reply to the first"])
    expect(buttonIn(container, "Reply")).toBeUndefined()
  })
}
