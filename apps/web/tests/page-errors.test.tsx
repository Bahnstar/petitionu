import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test"
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
let failures = new Map<string, ReturnType<typeof fail>>()
let signOut: () => Response | Promise<Response> = () => Response.json({ success: true })
const originalFetch = globalThis.fetch

function answer(tag: string) {
  if (tag === "getMe") return student
  if (tag === "getCategories") return [{ id: categoryId, name: "Campus life", description: null }]
  return []
}

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.pathname === "/rpc/csrf-token") return Response.json({ token: "fresh-token" })
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  if (url.pathname === "/api/auth/sign-out") return signOut()
  if (url.pathname === "/rpc/") {
    const body = await request.json()
    calls.push(body.tag)
    const failure = failures.get(body.tag)
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
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { MemoryRouter, Route, Routes, useLocation } = await import("react-router-dom")
const { AuthProvider } = await import("../js/contexts/auth-context.tsx")
const { Header } = await import("../js/components/header.tsx")
const { default: ClassroomDetailPage } = await import("../js/pages/classroom-detail-page.tsx")
const { default: CreateClassroomPage } = await import("../js/pages/create-classroom-page.tsx")
const { default: CreatePetitionPage } = await import("../js/pages/create-petition-page.tsx")
const { default: ProfilePage } = await import("../js/pages/profile-page.tsx")
const { default: SupportPage } = await import("../js/pages/support-page.tsx")
const { PetitionOwnerControls } =
  await import("../js/features/petition/petition-owner-controls.tsx")
const { retryQuery, serverError } = await import("../lib/api-errors.ts")
const { readPetitionDraft, savePetitionDraft } = await import("../js/lib/petition-draft.ts")

afterAll(async () => {
  globalThis.fetch = originalFetch
  await GlobalRegistrator.unregister()
})

beforeEach(() => {
  calls = []
  failures = new Map()
  signOut = () => Response.json({ success: true })
})

afterEach(() => {
  document.body.innerHTML = ""
  document.head.innerHTML = ""
  sessionStorage.clear()
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
