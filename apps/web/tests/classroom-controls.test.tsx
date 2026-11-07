import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import type { ClassroomDto, MeDto, MembershipDto } from "@petitionu/domain"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const classroomId = "00000000-0000-4000-8000-000000000001"
const professorId = "00000000-0000-4000-8000-000000000002"
const taId = "00000000-0000-4000-8000-000000000003"
const at = "2026-10-01T12:00:00.000Z"

// As sent: the client decodes it.
const ta: typeof MeDto.Encoded = {
  id: taId,
  email: "ta@school.edu",
  firstName: "Tess",
  lastName: "Assistant",
  role: "student",
  insertedAt: at,
  graduationYear: null,
  emailVerified: true,
  profileComplete: true,
  organizationId: null,
  organization: null,
  hasPassword: true,
}

type Eligibility = Pick<ClassroomDto, "canManageClassroom" | "canManageMembers" | "canChangeRoles">

const classroom = (eligibility: Eligibility, archived = false): typeof ClassroomDto.Encoded => ({
  id: classroomId,
  name: "Civics",
  description: null,
  joinCode: eligibility.canManageClassroom ? "00000000-0000-4000-8000-0000000000aa" : null,
  archived,
  allowStudentPetitions: true,
  memberCount: 1,
  petitionCount: 0,
  professorId,
  professor: { id: professorId, firstName: "Pat", lastName: "Professor" },
  organizationId: null,
  insertedAt: at,
  updatedAt: at,
  ...eligibility,
})

const membership = (
  n: number,
  fields: Pick<MembershipDto, "role" | "status" | "canApprove" | "canRemove" | "canChangeRole"> & {
    readonly userId?: string
  },
): typeof MembershipDto.Encoded => {
  const userId = fields.userId ?? `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`
  return {
    id: `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`,
    classroomId,
    userId,
    invitedById: null,
    joinedAt: fields.status === "active" ? at : null,
    insertedAt: at,
    memberName: `Member ${n}`,
    user: { id: userId },
    classroom: { id: classroomId, name: "Civics" },
    role: fields.role,
    status: fields.status,
    canApprove: fields.canApprove,
    canRemove: fields.canRemove,
    canChangeRole: fields.canChangeRole,
  }
}

const staff = { canManageClassroom: false, canManageMembers: true, canChangeRoles: false }
const professor = { canManageClassroom: true, canManageMembers: true, canChangeRoles: true }
const nobody = { canManageClassroom: false, canManageMembers: false, canChangeRoles: false }

/** What the stubbed server answers; any other procedure gets an empty list. */
interface Answers {
  readonly getClassroomById?: typeof ClassroomDto.Encoded
  readonly getMembershipsForClassroom?: ReadonlyArray<typeof MembershipDto.Encoded>
  readonly archiveClassroom?: typeof ClassroomDto.Encoded
}

let answers: Answers = {}

function answer(tag: string) {
  if (tag === "getMe") return ta
  if (tag === "getClassroomById") return answers.getClassroomById
  if (tag === "getMembershipsForClassroom") return answers.getMembershipsForClassroom ?? []
  if (tag === "archiveClassroom") return answers.archiveClassroom
  return []
}
let calls: string[] = []
const originalFetch = globalThis.fetch

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.pathname === "/rpc/csrf-token") return Response.json({ token: "token" })
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  if (url.pathname === "/rpc/") {
    const body = await request.json()
    calls.push(body.tag)
    return Response.json([
      { _tag: "Exit", requestId: body.id, exit: { _tag: "Success", value: answer(body.tag) } },
    ])
  }
  return new Response("not found", { status: 404 })
}) as typeof fetch

const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { MemoryRouter, Route, Routes } = await import("react-router-dom")
const { AuthProvider } = await import("../js/contexts/auth-context.tsx")
const { default: ClassroomDetailPage } = await import("../js/pages/classroom-detail-page.tsx")

const confirm = spyOn(window, "confirm").mockImplementation(() => true)

afterAll(async () => {
  confirm.mockRestore()
  globalThis.fetch = originalFetch
  await GlobalRegistrator.unregister()
})

beforeEach(() => {
  answers = {}
  calls = []
})

afterEach(() => {
  document.body.innerHTML = ""
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)))

async function render() {
  const container = document.createElement("div")
  document.body.append(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRoot(container)
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/classrooms/${classroomId}`]}>
            <Routes>
              <Route path="/classrooms/:id" element={<ClassroomDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  )
  await settle()
  return container
}

/** The accessible names of the buttons on the page. */
const buttons = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].map(
    (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "",
  )

test("an active TA gets member controls from the server, without their own roster row", async () => {
  answers = {
    getClassroomById: classroom(staff),
    // A TA's roster doesn't need to hold their own membership for the controls to show.
    getMembershipsForClassroom: [
      membership(1, {
        role: "student",
        status: "pending",
        canApprove: true,
        canRemove: true,
        canChangeRole: false,
      }),
      membership(2, {
        role: "student",
        status: "active",
        canApprove: false,
        canRemove: true,
        canChangeRole: false,
      }),
    ],
  }
  const container = await render()
  const names = buttons(container)
  expect(names).toContain("Approve Member 1")
  expect(names).toContain("Decline Member 1’s request")
  expect(names).toContain("Remove Member 2 from classroom")
  expect(names).not.toContain("Promote Member 2 to TA")
  expect(names).not.toContain("Archive")
  expect(container.textContent).not.toContain("Join code")
  expect(container.textContent).not.toContain("Leave classroom")
})

test("a roster row saying the user is a TA grants nothing the server doesn't", async () => {
  answers = {
    getClassroomById: classroom(nobody),
    getMembershipsForClassroom: [
      membership(1, {
        userId: taId,
        role: "ta",
        status: "active",
        canApprove: false,
        canRemove: false,
        canChangeRole: false,
      }),
      membership(2, {
        role: "student",
        status: "pending",
        canApprove: false,
        canRemove: false,
        canChangeRole: false,
      }),
    ],
  }
  const container = await render()
  const names = buttons(container)
  expect(names.some((name) => /^(Approve|Decline|Remove|Promote|Demote) /.test(name))).toBe(false)
  expect(container.textContent).not.toContain("Join requests")
})

test("an archived classroom offers Decline but not Approve", async () => {
  answers = {
    getClassroomById: classroom(professor, true),
    getMembershipsForClassroom: [
      membership(1, {
        role: "student",
        status: "pending",
        canApprove: false,
        canRemove: true,
        canChangeRole: true,
      }),
    ],
  }
  const container = await render()
  const names = buttons(container)
  expect(names).not.toContain("Approve Member 1")
  expect(names).toContain("Decline Member 1’s request")
  expect(names).toContain("Unarchive")
})

test("archiving refreshes the roster, so Approve goes away", async () => {
  const pending = (canApprove: boolean) => [
    membership(1, {
      role: "student",
      status: "pending",
      canApprove,
      canRemove: true,
      canChangeRole: true,
    }),
  ]
  answers = {
    getClassroomById: classroom(professor),
    getMembershipsForClassroom: pending(true),
  }
  const container = await render()
  expect(buttons(container)).toContain("Approve Member 1")

  answers = {
    archiveClassroom: classroom(professor, true),
    getClassroomById: classroom(professor, true),
    getMembershipsForClassroom: pending(false),
  }
  const before = calls.filter((tag) => tag === "getMembershipsForClassroom").length
  const archive = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Archive",
  )!
  await act(() => archive.click())
  await settle()
  expect(calls.filter((tag) => tag === "getMembershipsForClassroom").length).toBe(before + 1)
  const names = buttons(container)
  expect(names).not.toContain("Approve Member 1")
  expect(names).toContain("Decline Member 1’s request")
})
