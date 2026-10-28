import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import type { MeDto } from "@petitionu/domain"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Recorded {
  readonly url: string
  readonly body: unknown
}

let requests: Recorded[] = []
let me: MeDto
const originalFetch = globalThis.fetch

const user = (hasPassword: boolean): MeDto => ({
  id: "user-1",
  email: "ada@school.edu",
  firstName: "Ada",
  lastName: "Lovelace",
  role: "student",
  insertedAt: "2026-10-01T12:00:00.000Z",
  graduationYear: null,
  emailVerified: true,
  profileComplete: true,
  organizationId: null,
  organization: null,
  hasPassword,
})

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  const text = await request.text()
  const body = text ? JSON.parse(text) : undefined
  requests.push({ url: url.pathname, body })
  if (url.pathname === "/rpc/csrf-token") return Response.json({ token: "fresh-token" })
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  if (url.pathname === "/rpc/") {
    // `getMe`, answered like the server: one exit per request, in Effect's JSON form.
    return Response.json([
      { _tag: "Exit", requestId: body.id, exit: { _tag: "Success", value: me } },
    ])
  }
  if (url.pathname === "/api/auth/change-password") {
    if (body.currentPassword !== "old password") {
      return Response.json(
        { code: "INVALID_PASSWORD", message: "Invalid password" },
        { status: 400 },
      )
    }
    return Response.json({ token: null, user: {} })
  }
  if (url.pathname === "/api/auth/request-password-reset") {
    return Response.json({ status: true, message: "If this email exists, check your email" })
  }
  return new Response("not found", { status: 404 })
}) as typeof fetch

const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { MemoryRouter } = await import("react-router-dom")
const { AuthProvider } = await import("../js/contexts/auth-context.tsx")
const { default: ProfilePage } = await import("../js/pages/profile-page.tsx")

afterAll(async () => {
  globalThis.fetch = originalFetch
  await GlobalRegistrator.unregister()
})

afterEach(() => {
  requests = []
  document.body.innerHTML = ""
  document.head.innerHTML = ""
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

async function render(signedIn: MeDto) {
  me = signedIn
  const container = document.createElement("div")
  document.body.append(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["currentUser"], signedIn)
  const root = createRoot(container)
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  )
  await settle()
  requests = []
  return container
}

function field(container: HTMLElement, label: string) {
  const found = [...container.querySelectorAll("label")].find((l) => l.textContent === label)
  const input = found && container.querySelector<HTMLInputElement>(`#${found.htmlFor}`)
  if (!input) throw new Error(`No field labelled ${label}`)
  return input
}

function type(input: HTMLInputElement, value: string) {
  // React tracks the input's value; set it through the native setter so onChange fires.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

async function changePassword(
  container: HTMLElement,
  values: { current: string; next: string; confirm: string },
) {
  await act(() => {
    type(field(container, "Current password"), values.current)
    type(field(container, "New password"), values.next)
    type(field(container, "Confirm new password"), values.confirm)
  })
  const form = field(container, "Current password").form!
  await act(() => form.requestSubmit())
  await settle()
}

const sent = (path: string) => requests.filter((r) => r.url === path)
const alert = (container: HTMLElement) =>
  container.querySelector('#change-password-form [role="alert"]')?.textContent

test("changes the password, then reloads the session's CSRF token", async () => {
  const container = await render(user(true))
  await changePassword(container, {
    current: "old password",
    next: "a new passphrase",
    confirm: "a new passphrase",
  })

  expect(sent("/api/auth/change-password").map((r) => r.body)).toEqual([
    {
      currentPassword: "old password",
      newPassword: "a new passphrase",
      newPasswordConfirmation: "a new passphrase",
    },
  ])
  expect(sent("/rpc/csrf-token")).toHaveLength(1)
  expect(container.textContent).toContain("Your password is changed")
  expect(field(container, "Current password").value).toBe("")
})

test("a mismatched confirmation or a short password never reaches the server", async () => {
  const container = await render(user(true))
  await changePassword(container, {
    current: "old password",
    next: "a new passphrase",
    confirm: "a different one",
  })
  expect(alert(container)).toBe("The new passwords don’t match.")

  await changePassword(container, { current: "old password", next: "short", confirm: "short" })
  expect(alert(container)).toBe("Choose a new password of at least 8 characters.")
  expect(sent("/api/auth/change-password")).toEqual([])
})

test("says when the current password is wrong", async () => {
  const container = await render(user(true))
  await changePassword(container, {
    current: "not it",
    next: "a new passphrase",
    confirm: "a new passphrase",
  })
  expect(alert(container)).toBe("Your current password is incorrect.")
  expect(sent("/rpc/csrf-token")).toEqual([])
})

test("an account without a password is offered a link to set one instead", async () => {
  const container = await render(user(false))
  expect(container.querySelector("#change-password-form")).toBeNull()

  const send = [...container.querySelectorAll("button")].find((b) =>
    /Email me a link/.test(b.textContent ?? ""),
  )!
  await act(() => send.click())
  await settle()
  expect(sent("/api/auth/request-password-reset").map((r) => r.body)).toEqual([
    { email: "ada@school.edu", redirectTo: "/reset" },
  ])
  expect(container.textContent).toContain("check your email")
})
