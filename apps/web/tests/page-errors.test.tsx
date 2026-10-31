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

/** Answers one RPC with the server's failure. */
const fail = (error: Record<string, unknown>) => ({ _tag: "Fail", error })
const notFound = fail({ _tag: "NotFound", message: "Classroom not found" })
const invalid = (...fields: { field: string; message: string }[]) =>
  fail({ _tag: "Invalid", message: fields[0]?.message ?? "is invalid", fields })

let calls: string[] = []
let failures: Record<string, ReturnType<typeof fail>> = {}
let signOut: () => Response | Promise<Response> = () => Response.json({ success: true })
const originalFetch = globalThis.fetch

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
    const failure = failures[body.tag]
    if (failure) {
      return Response.json([
        { _tag: "Exit", requestId: body.id, exit: { _tag: "Failure", cause: [failure] } },
      ])
    }
    const value = body.tag === "getMe" ? student : body.tag === "getCategories" ? categories : []
    return Response.json([{ _tag: "Exit", requestId: body.id, exit: { _tag: "Success", value } }])
  }
  return new Response("not found", { status: 404 })
}) as typeof fetch

const categories = [{ id: categoryId, name: "Campus life", description: null }]

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
const { retryQuery, serverError } = await import("../lib/api-errors.ts")
const { readPetitionDraft, savePetitionDraft } = await import("../js/lib/petition-draft.ts")

afterAll(async () => {
  globalThis.fetch = originalFetch
  await GlobalRegistrator.unregister()
})

beforeEach(() => {
  calls = []
  failures = {}
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
    failures = { getClassroomById: error }
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
