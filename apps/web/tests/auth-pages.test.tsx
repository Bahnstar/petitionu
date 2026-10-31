import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Recorded {
  readonly url: string
  readonly method: string
}

let requests: Recorded[] = []
const originalFetch = globalThis.fetch

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  requests.push({ url: url.pathname + url.search, method: request.method })
  if (url.pathname === "/rpc/csrf-token") return Response.json({ token: "fresh-token" })
  if (url.pathname === "/api/auth/get-session") return Response.json(null)
  if (url.pathname === "/api/auth/verify-email") return Response.json({ status: true, user: null })
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

async function render(path: string) {
  const container = document.createElement("div")
  document.body.append(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Signed out; seeded so the test only sees the requests the page itself makes.
  client.setQueryData(["currentUser"], null)
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

test("/auth/confirm warns a signed-out visitor that confirming removes their password", async () => {
  const container = await render("/auth/confirm?token=tok-123")
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "the password is removed",
  )
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
