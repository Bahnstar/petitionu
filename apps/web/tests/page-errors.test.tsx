import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import type { MeDto } from "@petitionu/domain"
import type { ComponentType } from "react"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const classroomId = "00000000-0000-4000-8000-000000000001"
const categoryId = "00000000-0000-4000-8000-000000000002"

// As sent: the client decodes it.
const student: typeof MeDto.Encoded = {
  id: "00000000-0000-4000-8000-000000000003",
  email: "ada@school.edu",
  firstName: "Ada",
  lastName: "Lovelace",
  role: "professor",
  insertedAt: "2026-10-01T12:00:00.000000Z",
  graduationYear: null,
  emailVerified: true,
  profileComplete: true,
  organizationId: null,
  organization: null,
  hasPassword: true,
}

interface FieldProblem {
  readonly field: string
  readonly message: string
}

interface ServerError {
  readonly _tag: string
  readonly message: string
  readonly fields?: ReadonlyArray<FieldProblem>
}

/** Answers one RPC with the server's failure. */
const fail = (error: ServerError) => ({ _tag: "Fail", error })
const notFound = fail({ _tag: "NotFound", message: "Classroom not found" })
const invalid = (...fields: FieldProblem[]) =>
  fail({ _tag: "Invalid", message: fields[0]?.message ?? "is invalid", fields })

let calls: string[] = []
let sawSecondUser = false
let refuseRpc = false
/** Only a reloaded token gets past the CSRF check, as after a session changed in another tab. */
let staleToken = false
/** `getMe` can't be reached: a thrown fetch, as when the network is down. */
let getMeDown = false
/** Any RPC answers 500. */
let serverDown = false
let signedInAs = student
let moderationQueue: unknown[] = []
let failures = new Map<string, ReturnType<typeof fail>>()
let signOut: () => Response | Promise<Response> = () => Response.json({ success: true })
let csrfToken: () => Response = () => Response.json({ token: "fresh-token" })
let csrfCalls = 0
/** How many CSRF reloads fail before they work again. */
let csrfFailures = 0
/** Procedures whose answers wait for `release`, as a slow or retrying refetch would. */
let held = new Set<string>()
let release = () => {}
let released = Promise.resolve()
const originalFetch = globalThis.fetch

function answer(tag: string) {
  if (tag === "getMe") return signedInAs
  if (tag === "getContentReports") return moderationQueue
  if (tag === "getCategories") return [{ id: categoryId, name: "Campus life", description: null }]
  return []
}

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.pathname === "/rpc/csrf-token") {
    csrfCalls += 1
    if (csrfFailures > 0) {
      csrfFailures -= 1
      return new Response("upstream error", { status: 500 })
    }
    return csrfToken()
  }
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  if (url.pathname === "/api/auth/sign-out") return signOut()
  if (url.searchParams.get("token") === "removes-password") {
    return Response.json({ status: true, user: null, passwordRemoved: true })
  }
  if (url.pathname.startsWith("/api/auth/")) {
    return Response.json({ status: true, token: "session", user: { id: "u1" }, session: {} })
  }
  if (url.pathname === "/rpc/" && refuseRpc) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  if (url.pathname === "/rpc/" && serverDown) return new Response("oops", { status: 500 })
  if (url.pathname === "/rpc/") {
    const body = await request.json()
    calls.push(body.tag)
    if (body.tag === "getMe" && getMeDown) throw new TypeError("Failed to fetch")
    if (staleToken && request.headers.get("x-csrf-token") !== "fresh-token") {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    // Read first: a held answer is the one from when the request was sent.
    const failure = failures.get(body.tag)
    if (held.has(body.tag)) await released
    if (failure) {
      return Response.json([
        { _tag: "Exit", requestId: body.id, exit: { _tag: "Failure", cause: [failure] } },
      ])
    }
    return Response.json([
      { _tag: "Exit", requestId: body.id, exit: { _tag: "Success", value: answer(body.tag) } },
    ])
  }
  return new Response("not found", { status: 404 })
}) as typeof fetch

const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const { QueryClient, QueryClientProvider, useQuery, useQueryClient } =
  await import("@tanstack/react-query")
const { MemoryRouter, Route, Routes, useLocation, useNavigate } = await import("react-router-dom")
const { AuthProvider, useAuth } = await import("../js/contexts/auth-context.tsx")
const { reloadCSRFToken } = await import("@petitionu/domain")
const { Header } = await import("../js/components/header.tsx")
const { authRoutes } = await import("../js/pages/auth/auth-routes.tsx")
const { default: ClassroomDetailPage } = await import("../js/pages/classroom-detail-page.tsx")
const { default: CreateClassroomPage } = await import("../js/pages/create-classroom-page.tsx")
const { default: CreatePetitionPage } = await import("../js/pages/create-petition-page.tsx")
const { default: ProfilePage } = await import("../js/pages/profile-page.tsx")
const { default: SupportPage } = await import("../js/pages/support-page.tsx")
const { default: ModerationPage } = await import("../js/pages/moderation-page.tsx")
const { PetitionOwnerControls } =
  await import("../js/features/petition/petition-owner-controls.tsx")
const { api, retryQuery, serverError } = await import("../lib/api.ts")
const { readPetitionDraft, savePetitionDraft } = await import("../js/lib/petition-draft.ts")

// Recorded, not followed: a full page load is the end of the page under test.
const assign = spyOn(window.location, "assign").mockImplementation(() => {})
const reload = spyOn(window.location, "reload").mockImplementation(() => {})

afterAll(async () => {
  globalThis.fetch = originalFetch
  await GlobalRegistrator.unregister()
})

beforeEach(() => {
  calls = []
  sawSecondUser = false
  refuseRpc = false
  staleToken = false
  getMeDown = false
  serverDown = false
  signedInAs = student
  moderationQueue = []
  failures = new Map()
  signOut = () => Response.json({ success: true })
  csrfToken = () => Response.json({ token: "fresh-token" })
  csrfCalls = 0
  csrfFailures = 0
  assign.mockClear()
  reload.mockClear()
  held = new Set()
  released = new Promise((resolve) => {
    release = () => resolve()
  })
})

afterEach(() => {
  document.body.innerHTML = ""
  document.head.innerHTML = ""
  sessionStorage.clear()
  localStorage.clear()
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)))

function Where() {
  return <p id="where">{useLocation().pathname}</p>
}

/** Renders `Page` at `path` the way the app does, with the app's retry rule. */
async function render(Page: ComponentType, path: string, routePath = "*", retryDelay = 1) {
  const container = document.createElement("div")
  document.body.append(container)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: retryQuery, retryDelay } },
  })
  const root = createRoot(container)
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Where />
            <Routes>
              <Route path={routePath} element={<Page />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  )
  await settle()
  return container
}

function button(container: HTMLElement, name: RegExp) {
  const found = [...container.querySelectorAll("button")].find((b) =>
    name.test(b.textContent ?? ""),
  )
  if (!found) throw new Error(`No button matching ${name}: ${container.innerHTML}`)
  return found
}

function type(field: Element | null, value: string) {
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement))
    throw new Error("Not a text field")
  const prototype = Object.getPrototypeOf(field)
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value)
  field.dispatchEvent(new Event("input", { bubbles: true }))
}

async function submit(form: Element | null) {
  await act(() => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await settle()
}

/** The error shown against a field: the element its `aria-describedby` names, and nothing else. */
function fieldError(container: HTMLElement, id: string) {
  const field = container.querySelector(`#${id}`)
  expect(field?.getAttribute("aria-invalid")).toBe("true")
  const described = (field?.getAttribute("aria-describedby") ?? "").split(" ")
  return described
    .map((name) => container.querySelector(`#${name}[role="alert"]`)?.textContent)
    .filter(Boolean)
    .join(" ")
}

const classroomPath = `/classrooms/${classroomId}`

for (const [name, error] of [
  ["not found", notFound],
  ["a guest", fail({ _tag: "Unauthenticated", message: "Sign in first." })],
] as const) {
  test(`a classroom that answers ${name} isn't asked again`, async () => {
    failures = new Map([["getClassroomById", error]])
    const container = await render(ClassroomDetailPage, classroomPath, "/classrooms/:id")
    await settle()

    expect(calls.filter((tag) => tag === "getClassroomById")).toEqual(["getClassroomById"])
    expect(container.textContent).toContain("This classroom couldn’t load")
  })
}

test("no typed answer from the server is tried again", () => {
  for (const type of ["unauthenticated", "forbidden", "not_found", "invalid"]) {
    expect(retryQuery(0, serverError([{ type, message: "No" }]))).toBe(false)
  }
})

test("a query that failed in transit is tried again", () => {
  const offline = new TypeError("Failed to fetch")
  expect(retryQuery(0, offline)).toBe(true)
  expect(retryQuery(2, offline)).toBe(true)
  expect(retryQuery(3, offline)).toBe(false)
  expect(retryQuery(0, serverError([{ type: "unknown", message: "Transport" }]))).toBe(true)
})

test("a classroom id that isn't a UUID shows the error at once, without retries", async () => {
  const container = await render(ClassroomDetailPage, "/classrooms/nope", "/classrooms/:id", 60_000)

  expect(container.textContent).toContain("Classroom not found")
  expect(calls).not.toContain("getClassroomById")
})

test("create classroom shows each field's error against its field", async () => {
  const container = await render(CreateClassroomPage, "/")
  type(container.querySelector("#name"), "n".repeat(256))
  type(container.querySelector("#description"), "d".repeat(2001))
  await settle()

  await submit(container.querySelector("#create-classroom-form"))

  expect(calls).not.toContain("createClassroom")
  expect(fieldError(container, "name")).toBe("length must be less than or equal to 255")
  expect(fieldError(container, "description")).toBe("length must be less than or equal to 2000")
  expect(document.activeElement?.id).toBe("name")
})

test("a field's error clears on its own while another stays", async () => {
  const container = await render(CreateClassroomPage, "/")
  type(container.querySelector("#name"), "n".repeat(256))
  type(container.querySelector("#description"), "d".repeat(2001))
  await settle()
  await submit(container.querySelector("#create-classroom-form"))

  type(container.querySelector("#name"), "Short")
  await settle()

  expect(container.querySelector("#name")?.getAttribute("aria-invalid")).toBe(null)
  expect(fieldError(container, "description")).toBe("length must be less than or equal to 2000")
})

test("the profile form shows the server's field errors against each field", async () => {
  failures = new Map([
    [
      "updateMyProfile",
      invalid(
        { field: "firstName", message: "is required" },
        { field: "graduationYear", message: "must be a year" },
      ),
    ],
  ])
  const container = await render(ProfilePage, "/")
  await submit(container.querySelector("#profile-form"))

  expect(fieldError(container, "profile-first-name")).toBe("is required")
  expect(fieldError(container, "profile-graduation-year")).toBe("must be a year")
  expect(container.querySelector("#profile-last-name")?.getAttribute("aria-invalid")).toBe(null)
  expect(document.activeElement?.id).toBe("profile-first-name")
})

test("an error about no field on the form still shows, once", async () => {
  failures = new Map([
    ["updateMyProfile", invalid({ field: "email", message: "Confirm your email first." })],
  ])
  const container = await render(ProfilePage, "/")
  await submit(container.querySelector("#profile-form"))

  const alerts = [...container.querySelectorAll('[role="alert"]')].map((a) => a.textContent)
  expect(alerts).toEqual(["Confirm your email first."])
})

test("create petition keeps help text and adds the error to each field", async () => {
  failures = new Map([
    [
      "createPetition",
      invalid(
        { field: "title", message: "is taken" },
        { field: "deadline", message: "must be in the future" },
        { field: "goal", message: "must be more than 0" },
      ),
    ],
  ])
  savePetitionDraft(null, {
    ...readPetitionDraft(null),
    title: "A title",
    description: "A description",
    categoryId,
  })
  const container = await render(CreatePetitionPage, "/")

  await submit(container.querySelector("#create-petition-form"))

  expect(fieldError(container, "title")).toBe("is taken")
  expect(container.querySelector("#title")?.getAttribute("aria-describedby")).toContain(
    "title-help",
  )
  expect(fieldError(container, "petition-deadline")).toBe("must be in the future")
  expect(fieldError(container, "goal")).toBe("must be more than 0")
  expect(container.querySelector("#petition-submit-error")).toBe(null)
  expect(document.activeElement?.id).toBe("title")
})

test("the support form shows its length error against the message", async () => {
  const container = await render(SupportPage, "/")
  type(container.querySelector("#support-message"), "m".repeat(5001))
  await settle()

  await submit(container.querySelector("form"))

  expect(calls).not.toContain("createSupportRequest")
  expect(fieldError(container, "support-message")).toBe("length must be less than or equal to 5000")
})

test("a petition update shows a second field's error too", async () => {
  failures = new Map([
    [
      "createUpdate",
      invalid(
        { field: "title", message: "is too long" },
        { field: "body", message: "is required" },
      ),
    ],
  ])
  const petition = {
    id: classroomId,
    title: "A title",
    description: "A description",
    goal: 100,
    deadline: null,
    allowComments: true,
    isAnonymous: false,
    status: "open",
    classroomId: null,
  } as const
  const container = await render(
    () => <PetitionOwnerControls petition={petition} canPublishUpdate />,
    "/",
  )
  await act(() => button(container, /^Post an update/).click())
  await settle()
  type(container.querySelector("#petition-update-title"), "News")
  type(container.querySelector("#petition-update-body"), "Body")
  await settle()

  await submit(container.querySelector("#petition-owner-update-form"))

  expect(fieldError(container, "petition-update-title")).toBe("is too long")
  expect(fieldError(container, "petition-update-body")).toBe("is required")
  expect(document.activeElement?.id).toBe("petition-update-title")
})

async function openPetitionEdit() {
  const petition = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "A petition",
    description: "A description",
    goal: 100,
    deadline: new Date("2026-01-02T03:04:05Z"),
    allowComments: true,
    isAnonymous: false,
    status: "open" as const,
    classroomId: null,
  }
  const container = await render(
    () => <PetitionOwnerControls petition={petition} canPublishUpdate />,
    "/",
  )
  await act(() => container.querySelector<HTMLButtonElement>("#edit-petition")!.click())
  return container
}

for (const [goal, message] of [
  ["0", "must be more than or equal to 1"],
  ["1.5", "is invalid"],
]) {
  test(`the petition edit form refuses a goal of ${goal} against the field, without a call`, async () => {
    const container = await openPetitionEdit()
    await act(async () => type(container.querySelector("#edit-petition-goal"), goal))
    calls = []

    await submit(container.querySelector("#petition-owner-edit-form"))

    expect(fieldError(container, "edit-petition-goal")).toBe(message)
    expect(calls).not.toContain("updatePetition")
  })
}

test("the petition edit form shows a refused deadline against its field", async () => {
  failures = new Map([
    ["updatePetition", invalid({ field: "deadline", message: "Choose a deadline in the future." })],
  ])
  const container = await openPetitionEdit()
  await act(async () =>
    type(container.querySelector("#edit-petition-deadline"), "2026-01-03T00:00"),
  )

  await submit(container.querySelector("#petition-owner-edit-form"))

  expect(fieldError(container, "edit-petition-deadline")).toBe("Choose a deadline in the future.")
  expect(document.activeElement?.id).toBe("edit-petition-deadline")
})

test("the petition edit form still shows an error about a setting with no field error", async () => {
  failures = new Map([
    ["updatePetition", invalid({ field: "allowComments", message: "is invalid" })],
  ])
  const container = await openPetitionEdit()

  await submit(container.querySelector("#petition-owner-edit-form"))

  const alerts = [...container.querySelectorAll('[role="alert"]')].map((a) => a.textContent)
  expect(alerts).toEqual(["is invalid"])
})

for (const classroom of ["not-a-uuid", ""]) {
  test(`create petition shows the not-found view for classroomId "${classroom}"`, async () => {
    const container = await render(CreatePetitionPage, `/?classroomId=${classroom}`)

    expect(container.querySelector("#not-found-page")).not.toBe(null)
    expect(container.querySelector("#create-petition-form")).toBe(null)
    expect(calls).not.toContain("getClassroomById")
    expect(sessionStorage.length).toBe(0)
  })
}

test("create petition still opens for a well-formed classroom id", async () => {
  const container = await render(CreatePetitionPage, `/?classroomId=${classroomId}`)

  expect(container.querySelector("#create-petition-form")).not.toBe(null)
  expect(calls).toContain("getClassroomById")
})

function HeaderOnly() {
  return <Header />
}

/** A page of a user's data, cached under a key that doesn't name the user. */
function AccountData() {
  const { afterAuthChange, refetch } = useAuth()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ["supportRequests"],
    queryFn: async () => {
      const result = await api.getMySupportRequests()
      if (result.success === false) throw serverError(result.errors)
      return sawSecondUser ? "Second user's request" : "First user's request"
    },
  })
  return (
    <>
      <Header />
      <p id="data">{query.data ?? "empty"}</p>
      <button type="button" onClick={() => afterAuthChange()}>
        Signed in
      </button>
      <button type="button" onClick={() => afterAuthChange({ sameUser: true })}>
        Password changed
      </button>
      <button type="button" onClick={refetch}>
        Check the user
      </button>
      <button
        type="button"
        onClick={() => client.invalidateQueries({ queryKey: ["supportRequests"] })}
      >
        Reload the data
      </button>
    </>
  )
}

async function signOutClick() {
  const container = await render(HeaderOnly, "/somewhere")
  await act(() => button(container, /^Sign out/).click())
  await settle()
  return container
}

test("signing out reloads the CSRF token, refreshes the user and goes home", async () => {
  const container = await signOutClick()

  expect(document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")).toBe(
    "fresh-token",
  )
  expect(container.querySelector("#where")?.textContent).toBe("/ash-typescript")
  expect(container.querySelector('[role="alert"]')).toBe(null)
  expect(container.textContent).toContain("Sign in")
})

test("signing out doesn't wait for refetches", async () => {
  const container = await render(AccountData, "/somewhere")
  held = new Set(["getMe", "getMySupportRequests"])

  await act(() => button(container, /^Sign out/).click())
  await settle()

  expect(container.querySelector("#where")?.textContent).toBe("/ash-typescript")
  expect(container.textContent).toContain("Sign in")
  await act(async () => release())
})

test("sign-out retries a failed CSRF reload once and carries on in the page", async () => {
  csrfFailures = 1
  const container = await signOutClick()

  expect(csrfCalls).toBe(2)
  expect(assign).not.toHaveBeenCalled()
  expect(container.querySelector("#where")?.textContent).toBe("/ash-typescript")
  expect(document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")).toBe(
    "fresh-token",
  )
})

test("sign-out loads the home page in full when the CSRF reload fails twice", async () => {
  csrfFailures = 2
  saveDrafts()
  const container = await signOutClick()

  expect(csrfCalls).toBe(2)
  expect(assign.mock.calls).toEqual([["/ash-typescript"]])
  expect(reload).not.toHaveBeenCalled()
  expect(container.querySelector("#where")?.textContent).toBe("/somewhere")
  expect(container.querySelector('[role="alert"]')).toBe(null)
  expect(readPetitionDraft(null).title).toBe("")
})

test("reloadCSRFToken rejects a failed response instead of storing it", async () => {
  const meta = document.createElement("meta")
  meta.setAttribute("name", "csrf-token")
  meta.setAttribute("content", "old-token")
  document.head.append(meta)
  csrfToken = () => Response.json({ error: "down" }, { status: 500 })

  await expect(reloadCSRFToken()).rejects.toThrow("500")
  expect(meta.getAttribute("content")).toBe("old-token")
})

test("the next user never sees the previous user's cached data", async () => {
  const container = await render(AccountData, "/")
  expect(container.querySelector("#data")?.textContent).toBe("First user's request")
  held = new Set(["getMySupportRequests"])
  sawSecondUser = true

  await act(() => button(container, /^Signed in/).click())
  await settle()

  expect(container.querySelector("#data")?.textContent).toBe("empty")
  await act(async () => release())
  await settle()
  expect(container.querySelector("#data")?.textContent).toBe("Second user's request")
})

test("a getMe sent before the sign-in can't decide who is signed in", async () => {
  failures = new Map([["getMe", fail({ _tag: "NotFound", message: "User not found" })]])
  held = new Set(["getMe"])
  const container = await render(AccountData, "/")
  failures = new Map()
  held = new Set()

  await act(() => button(container, /^Signed in/).click())
  await settle()
  await act(async () => release())
  await settle()

  expect(calls.filter((tag) => tag === "getMe").length).toBe(2)
  expect(button(container, /^Sign out/)).toBeTruthy()
})

function saveDrafts() {
  savePetitionDraft(null, { ...readPetitionDraft(null), title: "Public draft" })
  savePetitionDraft(classroomId, { ...readPetitionDraft(classroomId), title: "Class draft" })
  sessionStorage.setItem("unrelated", "kept")
}

test("signing out clears every petition draft and nothing else", async () => {
  saveDrafts()
  await signOutClick()

  expect(readPetitionDraft(null).title).toBe("")
  expect(readPetitionDraft(classroomId).title).toBe("")
  expect(sessionStorage.getItem("unrelated")).toBe("kept")
})

test("a failed sign-out keeps the drafts", async () => {
  saveDrafts()
  signOut = () => Response.json({ message: "No" }, { status: 500 })
  await signOutClick()

  expect(readPetitionDraft(null).title).toBe("Public draft")
})

test("signing in keeps a draft written before it", async () => {
  saveDrafts()
  const container = await render(AccountData, "/")

  await act(() => button(container, /^Signed in/).click())
  await settle()

  expect(readPetitionDraft(null).title).toBe("Public draft")
})

test("an auth change retries a failed CSRF reload once and stays in the page", async () => {
  const container = await render(AccountData, "/")
  csrfFailures = 1

  await act(() => button(container, /^Signed in/).click())
  await settle()

  expect(csrfCalls).toBe(2)
  expect(reload).not.toHaveBeenCalled()
  expect(assign).not.toHaveBeenCalled()
})

test("an auth change with no destination reloads the page when the CSRF reload fails twice", async () => {
  const container = await render(AccountData, "/")
  csrfFailures = 2
  const before = calls.length

  await act(() => button(container, /^Signed in/).click())
  await settle()

  expect(csrfCalls).toBe(2)
  expect(reload).toHaveBeenCalledTimes(1)
  expect(calls.length).toBe(before)
})

test("a password change reloads in place when the CSRF reload fails twice", async () => {
  const container = await render(AccountData, "/")
  csrfFailures = 2

  await act(() => button(container, /^Password changed/).click())
  await settle()

  expect(reload).toHaveBeenCalledTimes(1)
  expect(assign).not.toHaveBeenCalled()
  expect(container.querySelector("#data")?.textContent).toBe("First user's request")
})

test("a failed CSRF reload with no auth change never loads the page", async () => {
  csrfFailures = 99
  refuseRpc = true
  await render(AccountData, "/")

  expect(assign).not.toHaveBeenCalled()
  expect(reload).not.toHaveBeenCalled()
})

test("a password change keeps the same user's data on screen while it refreshes", async () => {
  const container = await render(AccountData, "/")
  held = new Set(["getMySupportRequests"])

  await act(() => button(container, /^Password changed/).click())
  await settle()

  expect(calls.filter((tag) => tag === "getMySupportRequests").length).toBe(2)
  expect(container.querySelector("#data")?.textContent).toBe("First user's request")
  expect(document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")).toBe(
    "fresh-token",
  )
  await act(async () => release())
})

for (const [name, response] of [
  ["the server refuses", () => Response.json({ message: "No" }, { status: 500 })],
  [
    "the network fails",
    () => {
      throw new TypeError("Failed to fetch")
    },
  ],
] as const) {
  test(`a failed sign-out says so and stays put when ${name}`, async () => {
    signOut = response
    const container = await signOutClick()

    const alert = container.querySelector('[role="alert"]')?.textContent
    expect(alert).toContain("couldn’t confirm you’re signed out")
    expect(alert).not.toContain("still signed in")
    expect(container.querySelector("#where")?.textContent).toBe("/somewhere")
    expect(button(container, /^Sign out/)).toBeTruthy()
  })
}

function HeaderWithRoutes() {
  const navigate = useNavigate()
  return (
    <>
      <Header />
      <button type="button" onClick={() => navigate("/other")}>
        Leave
      </button>
      <button type="button" onClick={() => navigate("/somewhere")}>
        Return
      </button>
    </>
  )
}

test("a sign-out failure stays gone after leaving the page and coming back", async () => {
  signOut = () => Response.json({ message: "No" }, { status: 500 })
  const container = await render(HeaderWithRoutes, "/somewhere")
  await act(() => button(container, /^Sign out/).click())
  await settle()
  expect(container.querySelector('[role="alert"]')).not.toBe(null)

  await act(() => button(container, /^Leave/).click())
  await settle()
  expect(container.querySelector('[role="alert"]')).toBe(null)

  await act(() => button(container, /^Return/).click())
  await settle()
  expect(container.querySelector("#where")?.textContent).toBe("/somewhere")
  expect(container.querySelector('[role="alert"]')).toBe(null)
})

test("signing out again after a failure works", async () => {
  signOut = () => Response.json({ message: "No" }, { status: 500 })
  const container = await signOutClick()

  signOut = () => Response.json({ success: true })
  await act(() => button(container, /^Sign out/).click())
  await settle()

  expect(container.querySelector('[role="alert"]')).toBe(null)
  expect(container.querySelector("#where")?.textContent).toBe("/ash-typescript")
})

function AuthPages() {
  return (
    <Routes>
      {authRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
      <Route path="*" element={<p>Landed</p>} />
    </Routes>
  )
}

const destination = "/ash-typescript/petitions"
const returnTo = `return_to=${encodeURIComponent(destination)}`

async function fillPasswords(container: HTMLElement) {
  type(container.querySelector("#password"), "a good password")
  type(container.querySelector("#password-confirmation"), "a good password")
  await settle()
  await submit(container.querySelector("form"))
}

const finishSignIn = async (container: HTMLElement) => {
  type(container.querySelector("#email"), "ada@school.edu")
  type(container.querySelector("#password"), "a good password")
  await settle()
  await submit(container.querySelector("form"))
}

const finishRegistration = async (container: HTMLElement) => {
  type(container.querySelector("#email"), "ada@school.edu")
  await fillPasswords(container)
}

const clickThrough = (name: RegExp) => async (container: HTMLElement) => {
  await act(() => button(container, name).click())
  await settle()
}

// Each of these URLs is spent or wrong once the action is done, so none may simply reload.
for (const flow of [
  { name: "sign-in", path: `/sign-in?${returnTo}`, finish: finishSignIn, navigates: true },
  { name: "password reset", path: `/reset?token=tok-1&${returnTo}`, finish: fillPasswords },
  {
    name: "magic link",
    path: "/auth/magic?token=tok-1",
    finish: clickThrough(/^Sign in/),
    remembered: true,
    navigates: true,
  },
  {
    name: "email confirmation",
    path: "/auth/confirm?token=tok-1",
    finish: clickThrough(/^Confirm/),
    remembered: true,
  },
]) {
  test(`${flow.name} loads its destination in full when the CSRF reload fails twice`, async () => {
    if (flow.remembered) localStorage.setItem("petitionu:return-to", destination)
    const container = await render(AuthPages, flow.path)
    const at = container.querySelector("#where")?.textContent
    csrfFailures = 2

    await flow.finish(container)

    expect(csrfCalls).toBe(2)
    expect(assign.mock.calls).toEqual([[destination]])
    expect(reload).not.toHaveBeenCalled()
    expect(container.querySelector("#where")?.textContent).toBe(at)
  })

  test(`${flow.name} carries on in the page when the CSRF retry works`, async () => {
    if (flow.remembered) localStorage.setItem("petitionu:return-to", destination)
    const container = await render(AuthPages, flow.path)
    csrfFailures = 1

    await flow.finish(container)

    expect(csrfCalls).toBe(2)
    expect(assign).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    if (flow.navigates) expect(container.querySelector("#where")?.textContent).toBe(destination)
  })
}

test("registration stays on its check-your-email screen: it has no token to reload", async () => {
  const container = await render(AuthPages, `/register?${returnTo}`)
  csrfFailures = 2

  await finishRegistration(container)

  expect(csrfCalls).toBe(0)
  expect(assign).not.toHaveBeenCalled()
  expect(reload).not.toHaveBeenCalled()
  expect(container.textContent).toContain("Check your email")
})

test("a confirmation that removed the password still says so after a full page load", async () => {
  localStorage.setItem("petitionu:return-to", destination)
  const container = await render(AuthPages, "/auth/confirm?token=removes-password")
  csrfFailures = 2

  await clickThrough(/^Confirm/)(container)

  expect(assign).toHaveBeenCalledTimes(1)
  const landing = String(assign.mock.calls[0]![0])
  expect(landing).toStartWith("/auth/confirm?")
  expect(landing).not.toContain("token")

  const landed = await render(AuthPages, landing)
  expect(landed.textContent).toContain("password has been removed")
  expect(landed.querySelector('a[href="/reset"]')).not.toBeNull()
  expect(landed.querySelector(`a[href="${destination}"]`)).not.toBeNull()
})

const endSession = () => {
  staleToken = true
  failures = new Map([
    ["getMe", fail({ _tag: "NotFound", message: "User not found" })],
    ["getMySupportRequests", fail({ _tag: "Unauthenticated", message: "Sign in first." })],
  ])
}

function SupportWithHeader() {
  return (
    <>
      <Header />
      <SupportPage />
    </>
  )
}

const count = (tag: string) => calls.filter((call) => call === tag).length
const fullLoads = () => assign.mock.calls.length + reload.mock.calls.length

for (const [name, Page, field, form, write] of [
  ["support", SupportPage, "#support-message", "form", "createSupportRequest"],
  ["profile", ProfilePage, "#profile-first-name", "#profile-form", "updateMyProfile"],
  ["new classroom", CreateClassroomPage, "#name", "#create-classroom-form", "createClassroom"],
] as const) {
  test(`a stale tab's ${name} form says to sign in once and keeps what was typed`, async () => {
    const container = await render(Page, "/")
    type(container.querySelector(field), "Typed before it ended")
    await settle()
    endSession()

    await submit(container.querySelector(form))

    expect(container.textContent).toContain("Sign in to participate.")
    expect(container.querySelector<HTMLInputElement>(field)?.value).toBe("Typed before it ended")
    expect(count(write)).toBe(1)
    expect(csrfCalls).toBe(1)
    expect(fullLoads()).toBe(0)
  })
}

test("a stale tab's moderation note stays when the session has ended", async () => {
  signedInAs = { ...student, role: "admin" }
  moderationQueue = [
    {
      id: categoryId,
      petitionId: classroomId,
      commentId: null,
      targetTitle: "A title",
      targetText: "A title",
      reason: "spam",
      details: null,
      state: "open",
      resolutionNote: null,
      insertedAt: student.insertedAt,
      resolvedAt: null,
    },
  ]
  const container = await render(ModerationPage, "/")
  const note = container.querySelector("textarea")
  type(note, "Typed before it ended")
  await settle()
  endSession()

  await submit(container.querySelector("form"))

  expect(container.textContent).toContain("Sign in to participate.")
  expect(container.querySelector("textarea")?.value).toBe("Typed before it ended")
})

test("the header stops showing a user whose session ended", async () => {
  const container = await render(AccountData, "/")
  expect(button(container, /^Sign out/)).toBeTruthy()
  endSession()

  await act(() => button(container, /^Check the user/).click())
  await settle()

  expect(() => button(container, /^Sign out/)).toThrow()
  expect(count("getMe")).toBe(3)
  expect(csrfCalls).toBe(1)
  expect(fullLoads()).toBe(0)
})

test("a read refused for a stale token stops retrying and clears the user", async () => {
  const container = await render(AccountData, "/")
  endSession()
  const before = count("getMySupportRequests")

  await act(() => button(container, /^Reload the data/).click())
  await settle()
  await settle()

  expect(count("getMySupportRequests") - before).toBe(1)
  expect(() => button(container, /^Sign out/)).toThrow()
  expect(csrfCalls).toBe(1)
  expect(fullLoads()).toBe(0)
})

test("a stale token with a live session recovers in place and refreshes the page", async () => {
  const container = await render(AccountData, "/")
  staleToken = true
  const before = count("getMySupportRequests")

  await act(() => button(container, /^Check the user/).click())
  await settle()

  expect(button(container, /^Sign out/)).toBeTruthy()
  expect(csrfCalls).toBe(1)
  expect(count("getMySupportRequests") - before).toBe(1)
  expect(fullLoads()).toBe(0)
})

test("a write refused while the session lives isn't resent or called signed out", async () => {
  const container = await render(SupportWithHeader, "/")
  type(container.querySelector("#support-message"), "Please help")
  await settle()
  staleToken = true

  await submit(container.querySelector("form"))

  expect(count("createSupportRequest")).toBe(1)
  expect(container.textContent).not.toContain("Sign in to participate.")
  expect(button(container, /^Sign out/)).toBeTruthy()
})

test("a stale token hiding a different user starts the page empty for them", async () => {
  const container = await render(AccountData, "/")
  expect(container.querySelector("#data")?.textContent).toBe("First user's request")
  staleToken = true
  signedInAs = { ...student, id: "00000000-0000-4000-8000-000000000009" }
  held = new Set(["getMySupportRequests"])
  sawSecondUser = true

  await act(() => button(container, /^Check the user/).click())
  await settle()

  expect(container.querySelector("#data")?.textContent).toBe("empty")
  await act(async () => release())
  await settle()
  expect(container.querySelector("#data")?.textContent).toBe("Second user's request")
})

test("a getMe the network fails reloads the token once and keeps the user", async () => {
  const container = await render(AccountData, "/")
  getMeDown = true
  const before = count("getMe")

  await act(() => button(container, /^Check the user/).click())
  await settle()
  await settle()

  expect(count("getMe") - before).toBe(2)
  expect(csrfCalls).toBe(1)
  expect(button(container, /^Sign out/)).toBeTruthy()
  expect(fullLoads()).toBe(0)
})

test("a token that can't be reloaded keeps the user and loads no page", async () => {
  const container = await render(AccountData, "/")
  staleToken = true
  csrfFailures = 99
  const before = count("getMe")

  await act(() => button(container, /^Check the user/).click())
  await settle()
  await settle()

  expect(count("getMe") - before).toBe(1)
  expect(csrfCalls).toBe(1)
  expect(button(container, /^Sign out/)).toBeTruthy()
  expect(fullLoads()).toBe(0)
})

test("a write that fails on a server fault asks nothing of the session", async () => {
  const container = await render(SupportWithHeader, "/")
  type(container.querySelector("#support-message"), "Please help")
  await settle()
  const before = count("getMe")
  serverDown = true

  await submit(container.querySelector("form"))

  expect(count("getMe")).toBe(before)
  expect(csrfCalls).toBe(0)
  expect(button(container, /^Sign out/)).toBeTruthy()
  expect(fullLoads()).toBe(0)
})

// Keep last: it starts the whole app, which stays mounted.
test("startup can't loop: a page with no token that can't get one stays put", async () => {
  csrfFailures = 99
  refuseRpc = true
  const app = document.createElement("div")
  app.id = "app"
  document.body.append(app)

  await act(async () => {
    await import("../js/index.tsx")
  })
  await settle()

  // One for the page, which has no token, and one when `getMe` is refused for it.
  expect(csrfCalls).toBe(2)
  expect(assign).not.toHaveBeenCalled()
  expect(reload).not.toHaveBeenCalled()
  expect(app.textContent).not.toBe("")
})
