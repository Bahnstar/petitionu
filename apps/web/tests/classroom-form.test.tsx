import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test"
import type { ClassroomDto, MeDto } from "@petitionu/domain"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const classroomId = "00000000-0000-4000-8000-000000000001"
const professorId = "00000000-0000-4000-8000-000000000002"
const joinCode = "00000000-0000-4000-8000-0000000000aa"
const at = "2026-10-01T12:00:00.000Z"

// As sent: the client decodes it.
const professorUser: typeof MeDto.Encoded = {
  id: professorId,
  email: "pat@school.edu",
  firstName: "Pat",
  lastName: "Professor",
  role: "professor",
  insertedAt: at,
  graduationYear: null,
  emailVerified: true,
  profileComplete: true,
  organizationId: null,
  organization: null,
  hasPassword: true,
}

const classroom = (
  fields: Partial<typeof ClassroomDto.Encoded> = {},
): typeof ClassroomDto.Encoded => ({
  id: classroomId,
  name: "Civics",
  description: "Local government",
  joinCode,
  archived: false,
  allowStudentPetitions: true,
  memberCount: 0,
  petitionCount: 0,
  professorId,
  professor: { id: professorId, firstName: "Pat", lastName: "Professor" },
  organizationId: null,
  insertedAt: at,
  updatedAt: at,
  canManageClassroom: true,
  canManageMembers: true,
  ...fields,
})

interface Call {
  readonly tag: string
  readonly payload: unknown
}

type Encoded = typeof ClassroomDto.Encoded

/** What the stubbed server answers; any other procedure gets an empty list. */
interface Answers {
  readonly getClassroomById?: Encoded
  readonly createClassroom?: Encoded
  readonly updateClassroom?: Encoded
}

interface ServerError {
  readonly _tag: string
  readonly message: string
  readonly fields?: ReadonlyArray<{ readonly field: string; readonly message: string }>
}

let answers: Answers = {}
/** Procedures that fail, with the server's error. */
interface Failures {
  readonly createClassroom?: ServerError
}

let failures: Failures = {}

function answer(tag: string) {
  if (tag === "getMe") return professorUser
  if (tag === "getClassroomById") return answers.getClassroomById
  if (tag === "createClassroom") return answers.createClassroom
  if (tag === "updateClassroom") return answers.updateClassroom
  return []
}
/** Procedures whose answers wait for `release`. */
let held = new Set<string>()
let release = () => {}
let calls: Call[] = []
const originalFetch = globalThis.fetch

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.pathname === "/rpc/csrf-token") return Response.json({ token: "token" })
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  if (url.pathname === "/rpc/") {
    const body = await request.json()
    calls.push({ tag: body.tag, payload: body.payload })
    if (held.has(body.tag)) await new Promise<void>((resolve) => (release = resolve))
    const failure = body.tag === "createClassroom" ? failures.createClassroom : undefined
    const exit = failure
      ? { _tag: "Failure", cause: [{ _tag: "Fail", error: failure }] }
      : { _tag: "Success", value: answer(body.tag) }
    return Response.json([{ _tag: "Exit", requestId: body.id, exit }])
  }
  return new Response("not found", { status: 404 })
}) as typeof fetch

const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { MemoryRouter, Route, Routes } = await import("react-router-dom")
const { AuthProvider } = await import("../js/contexts/auth-context.tsx")
const { ROUTES } = await import("../js/lib/routes.ts")
const { default: ClassroomDetailPage } = await import("../js/pages/classroom-detail-page.tsx")
const { default: CreateClassroomPage } = await import("../js/pages/create-classroom-page.tsx")
const { default: EditClassroomPage } = await import("../js/pages/edit-classroom-page.tsx")

afterAll(async () => {
  globalThis.fetch = originalFetch
  await GlobalRegistrator.unregister()
})

beforeEach(() => {
  answers = {}
  failures = {}
  held = new Set()
  calls = []
})

afterEach(() => {
  release()
  document.body.innerHTML = ""
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)))

async function render(path: string) {
  const container = document.createElement("div")
  document.body.append(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRoot(container)
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={ROUTES.classroomNew} element={<CreateClassroomPage />} />
              <Route path={ROUTES.classroom(":id")} element={<ClassroomDetailPage />} />
              <Route path={ROUTES.classroomEdit(":id")} element={<EditClassroomPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  )
  await settle()
  return container
}

function type(field: Element | null, value: string) {
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement))
    throw new Error("Not a text field")
  const prototype = Object.getPrototypeOf(field)
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function submit(form: Element | null) {
  await act(() => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await settle()
}

/** The texts of the elements a control's `aria-describedby` names. */
const descriptions = (container: HTMLElement, control: Element | null) =>
  (control?.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => container.querySelector(`#${id}`)?.textContent?.trim())

const writes = (tag: string) => calls.filter((call) => call.tag === tag)

test("the petition setting is a labelled switch with its help text", async () => {
  const container = await render(ROUTES.classroomNew)
  const toggle = container.querySelector<HTMLInputElement>("#allowStudentPetitions")!
  expect(toggle.getAttribute("role")).toBe("switch")
  expect(toggle.checked).toBe(true)
  expect(container.querySelector('label[for="allowStudentPetitions"]')?.textContent).toBe(
    "Students may create petitions",
  )
  expect(descriptions(container, toggle)).toEqual([
    "When off, only you can start petitions in this classroom.",
  ])
})

test("the counters use the domain's limits and count the trimmed text", async () => {
  const container = await render(ROUTES.classroomNew)
  type(container.querySelector("#name"), "  Civics  ")
  await settle()
  const name = container.querySelector("#name")
  const description = container.querySelector("#description")
  expect(descriptions(container, name)).toEqual(["Characters used: 6 / 255"])
  expect(descriptions(container, description)).toContain("Characters used: 0 / 2,000")

  type(description, "d".repeat(2001))
  await settle()
  expect(descriptions(container, description)).toContain("Too long: 2,001 / 2,000")
})

test("creating sends the form once, disables it while saving and shows the join code", async () => {
  answers = { createClassroom: classroom(), getClassroomById: classroom() }
  held = new Set(["createClassroom"])
  const container = await render(ROUTES.classroomNew)
  type(container.querySelector("#name"), "Civics")
  await settle()
  const toggle = container.querySelector<HTMLInputElement>("#allowStudentPetitions")!
  await act(() => toggle.click())

  const form = container.querySelector("#create-classroom-form")
  await submit(form)
  await submit(form)
  expect(container.querySelector<HTMLInputElement>("#name")?.disabled).toBe(true)
  expect(container.querySelector<HTMLTextAreaElement>("#description")?.disabled).toBe(true)
  expect(toggle.disabled).toBe(true)
  expect(writes("createClassroom")).toHaveLength(1)
  expect(writes("createClassroom")[0]?.payload).toEqual({
    name: "Civics",
    description: null,
    allowStudentPetitions: false,
  })

  release()
  await settle()
  const notice = container.querySelector("#classroom-created")
  expect(notice?.textContent).toContain("Your classroom is ready.")
  expect(notice?.textContent).toContain(joinCode)
})

test("the server's field errors land on their fields", async () => {
  failures = {
    createClassroom: {
      _tag: "Invalid",
      message: "has already been taken",
      fields: [
        { field: "name", message: "has already been taken" },
        { field: "allowStudentPetitions", message: "is invalid" },
      ],
    },
  }
  const container = await render(ROUTES.classroomNew)
  type(container.querySelector("#name"), "Civics")
  await settle()
  await submit(container.querySelector("#create-classroom-form"))

  const name = container.querySelector("#name")
  expect(name?.getAttribute("aria-invalid")).toBe("true")
  expect(descriptions(container, name)).toContain("has already been taken")
  const toggle = container.querySelector("#allowStudentPetitions")
  expect(toggle?.getAttribute("aria-invalid")).toBe("true")
  expect(descriptions(container, toggle)).toContain("is invalid")
  expect(document.activeElement?.id).toBe("name")
})

test("the classroom's professor is offered Edit; staff and members are not", async () => {
  answers = { getClassroomById: classroom() }
  let container = await render(ROUTES.classroom(classroomId))
  const edit = [...container.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Edit")
  expect(edit?.getAttribute("href")).toBe(ROUTES.classroomEdit(classroomId))

  document.body.innerHTML = ""
  answers = { getClassroomById: classroom({ canManageClassroom: false, joinCode: null }) }
  container = await render(ROUTES.classroom(classroomId))
  expect([...container.querySelectorAll("a")].map((a) => a.textContent?.trim())).not.toContain(
    "Edit",
  )
})

test("editing starts from the classroom's values and sends the changes", async () => {
  answers = {
    getClassroomById: classroom(),
    updateClassroom: classroom({ name: "Civics II", allowStudentPetitions: false }),
  }
  const container = await render(ROUTES.classroomEdit(classroomId))
  expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe("Civics")
  expect(container.querySelector<HTMLTextAreaElement>("#description")?.value).toBe(
    "Local government",
  )
  type(container.querySelector("#name"), "Civics II ")
  type(container.querySelector("#description"), "   ")
  await settle()
  await act(() => container.querySelector<HTMLInputElement>("#allowStudentPetitions")!.click())
  // The classroom page reads the saved classroom back.
  answers = { ...answers, getClassroomById: answers.updateClassroom }
  await submit(container.querySelector("#edit-classroom-form"))

  expect(writes("updateClassroom").map((call) => call.payload)).toEqual([
    { id: classroomId, name: "Civics II", description: null, allowStudentPetitions: false },
  ])
  expect(container.textContent).toContain("Classroom changes saved.")
  expect(container.querySelector("h1")?.textContent).toBe("Civics II")
})

test("someone the server doesn't let edit gets no form", async () => {
  answers = { getClassroomById: classroom({ canManageClassroom: false, joinCode: null }) }
  const container = await render(ROUTES.classroomEdit(classroomId))
  expect(container.querySelector("#edit-classroom-form")).toBe(null)
  expect(container.textContent).toContain("Only the professor can edit this classroom.")
})

test("an edit id that isn't a UUID shows the not-found view without asking", async () => {
  const container = await render(ROUTES.classroomEdit("nope"))
  expect(container.textContent).toContain("Classroom not found")
  expect(writes("getClassroomById")).toHaveLength(0)
})
