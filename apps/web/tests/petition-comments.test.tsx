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
let refusal: string | null = null
let replies: Array<CreateCommentPayload> = []

const petition = (): Petition => ({
  id: petitionId,
  title: "A better campus",
  description: "More benches",
  status: "open",
  classroomId: null,
  organizationId: null,
  hasSigned: false,
  canManage: false,
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

function createComment(payload: CreateCommentPayload) {
  replies.push(payload)
  const created = comment("00000000-0000-4000-8000-000000000020", payload.text, {
    parentCommentId: firstId,
    canEdit: true,
  })
  comments = [...comments, created]
  return { ...created, petitionId }
}

function answer(tag: string, payload: CreateCommentPayload) {
  if (tag === "getMe") return user
  if (tag === "createComment") return createComment(payload)
  return petition()
}

const originalFetch = globalThis.fetch
// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.pathname === "/rpc/csrf-token") return Response.json({ token: "fresh-token" })
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  const { id, tag, payload } = JSON.parse(await request.text())
  if (tag === "createComment" && refusal) {
    const error = {
      _tag: "Invalid",
      message: "Invalid",
      fields: [{ field: "parentCommentId", message: refusal }],
    }
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
  replies = []
  document.body.innerHTML = ""
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

async function render(signedIn = user) {
  const container = document.createElement("div")
  document.body.append(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
  expect(commentWith(container, "The second comment").querySelector("form")).toBeNull()
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
  refusal = "Reply to a comment in this petition."
  const container = await render()
  const form = await reply(commentWith(container, "The first comment"), "Too late")
  expect(form.querySelector("[role=alert]")?.textContent).toBe(refusal)
  expect(form.querySelector("textarea")?.value).toBe("Too late")
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

const noReply: Array<[string, Partial<Petition>, typeof user]> = [
  ["the petition is closed", { status: "closed" }, user],
  ["comments are turned off", { allowComments: false }, user],
  ["the profile is incomplete", {}, { ...user, profileComplete: false }],
]
for (const [why, overrides, signedIn] of noReply) {
  test(`no Reply when ${why}, and the replies stay readable`, async () => {
    petitionOverrides = overrides
    const container = await render(signedIn)
    expect(threads(container)[0]).toEqual(["The first comment", "A reply to the first"])
    expect(buttonIn(container, "Reply")).toBeUndefined()
  })
}
