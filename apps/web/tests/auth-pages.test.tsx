import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Recorded {
  readonly url: string
  readonly method: string
}

const appRequestHeader = "x-petitionu-app"
const linkEndpoints = ["/api/auth/verify-email", "/api/auth/magic-link/verify"]

let requests: Recorded[] = []
const originalFetch = globalThis.fetch

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  requests.push({ url: url.pathname + url.search, method: request.method })
  // As the server does: these endpoints refuse a request without the app's header.
  if (linkEndpoints.includes(url.pathname) && !request.headers.get(appRequestHeader)) {
    return Response.json({ message: "Open the link from your email" }, { status: 403 })
  }
  if (url.pathname === "/rpc/csrf-token") return Response.json({ token: "fresh-token" })
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  if (url.pathname === "/api/auth/sign-in/email") {
    return Response.json(
      { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
      { status: 403 },
    )
  }
  if (url.pathname === "/api/auth/sign-up/email") {
    return Response.json({ token: null, user: { id: "u1" } })
  }
  if (url.pathname === "/api/auth/verify-email") {
    if (url.searchParams.get("token") === "elsewhere") {
      if (!url.searchParams.has("removePassword")) {
        return Response.json(
          { code: "CONFIRM_REMOVES_PASSWORD", message: "Confirming here removes the password" },
          { status: 409 },
        )
      }
      return Response.json({ status: true, user: null, passwordRemoved: true })
    }
    return Response.json({ status: true, user: null })
  }
  if (url.pathname === "/api/auth/magic-link/verify" && url.searchParams.get("token") === "bad") {
    // Better Auth redirects every rejected magic link to `/?error=`, even without a callbackURL.
    if (request.redirect !== "manual") throw new TypeError("Failed to fetch")
    return Response.redirect("http://localhost:4100/?error=INVALID_TOKEN", 302)
  }
  if (url.pathname === "/api/auth/magic-link/verify") {
    return Response.json({ token: "session", user: { id: "u1" }, session: {} })
  }
  return new Response("not found", { status: 404 })
}) as typeof fetch

const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { MemoryRouter, Route, Routes } = await import("react-router-dom")
const { AuthProvider } = await import("../js/contexts/auth-context.tsx")
const { authRoutes } = await import("../js/pages/auth/auth-routes.tsx")

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

async function render(path: string, currentUser: { readonly id: string } | null = null) {
  const container = document.createElement("div")
  document.body.append(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seeded so the test only sees the requests the page itself makes.
  client.setQueryData(["currentUser"], currentUser)
  const root = createRoot(container)
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              {authRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
              <Route path="*" element={<p>Somewhere else</p>} />
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

/** Submits the page's form, past the browser's checks on its empty fields. */
function submit(container: HTMLElement) {
  container
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

const touching = (token: string) => requests.filter((r) => r.url.includes(token))

for (const page of [
  { path: "/auth/confirm", button: /^Confirm/, endpoint: "/api/auth/verify-email" },
  { path: "/auth/magic", button: /^Sign in/, endpoint: "/api/auth/magic-link/verify" },
]) {
  test(`${page.path} uses the token only after the button is clicked`, async () => {
    const container = await render(`${page.path}?token=tok-123`)
    expect(touching("tok-123")).toEqual([])
    expect(requests.filter((r) => r.url.startsWith(page.endpoint))).toEqual([])

    await act(() => button(container, page.button).click())
    await settle()

    expect(touching("tok-123")).toEqual([{ url: `${page.endpoint}?token=tok-123`, method: "GET" }])
    // The CSRF token is bound to the session, so the page reloads it after signing in.
    expect(requests.some((r) => r.url === "/rpc/csrf-token")).toBe(true)
    expect(document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")).toBe(
      "fresh-token",
    )
  })
}

test("/auth/confirm says nothing about the password when the server keeps it", async () => {
  for (const user of [null, { id: "u1" }]) {
    const container = await render("/auth/confirm?token=tok-123", user)
    expect(container.textContent).not.toContain("password")

    await act(() => button(container, /^Confirm$/).click())
    await settle()

    expect(container.textContent).toContain("has now been confirmed")
    expect(container.textContent).not.toContain("password")
    container.remove()
  }
})

for (const [name, user] of [
  ["signed out", null],
  ["signed in as someone else", { id: "u2" }],
] as const) {
  test(`/auth/confirm warns a visitor ${name} before removing the password`, async () => {
    const container = await render("/auth/confirm?token=elsewhere", user)
    expect(container.textContent).not.toContain("removes its password")

    await act(() => button(container, /^Confirm$/).click())
    await settle()

    // The first click changed nothing and the page says what the second will do.
    expect(container.textContent).toContain("confirming here removes its password")
    expect(requests.some((r) => r.url === "/rpc/csrf-token")).toBe(false)
    expect(requests.some((r) => r.url.includes("removePassword"))).toBe(false)

    await act(() => button(container, /^Confirm and remove password/).click())
    await settle()

    expect(requests.some((r) => r.url.includes("removePassword=true"))).toBe(true)
    expect(container.textContent).toContain("password has been removed")
    expect(container.querySelector('a[href="/reset"]')).not.toBeNull()
  })
}

test("/sign-in tells an unconfirmed user to confirm and that a new link was sent", async () => {
  const container = await render("/sign-in")
  await act(() => submit(container))
  await settle()

  const alert = container.querySelector('[role="alert"]')?.textContent
  expect(alert).toContain("Confirm your email address")
  expect(alert).toContain("new confirmation link")
})

test("/register doesn't promise an account or send anyone onwards", async () => {
  const container = await render("/register")
  await act(() => submit(container))
  await settle()

  expect(container.textContent).toContain("Check your email")
  expect(container.textContent).not.toContain("Continue to PetitionU")
  expect(container.textContent).not.toContain("account is ready")
})

test("/auth/magic explains a rejected link", async () => {
  const container = await render("/auth/magic?token=bad")
  await act(() => button(container, /^Sign in/).click())
  await settle()

  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "This sign-in link is invalid or has expired",
  )
  expect(requests.some((r) => r.url === "/rpc/csrf-token")).toBe(false)
})
