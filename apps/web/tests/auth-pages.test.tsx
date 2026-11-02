import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Recorded {
  readonly url: string
  readonly method: string
  readonly body?: string
}

const appRequestHeader = "x-petitionu-app"
const linkEndpoints = [
  "/api/auth/verify-email",
  "/api/auth/magic-link/verify",
  "/api/auth/link-details",
  "/api/auth/verify-email/password",
]

interface LinkRequest {
  readonly token?: string
  readonly password?: string
}

// SAFETY: only the pages under test call this stub, and they send these fields as strings.
const parsed = (body: string | undefined) => JSON.parse(body ?? "{}") as LinkRequest

async function linkDetails(body: string | undefined) {
  const { token } = parsed(body)
  if (token === "invalid") {
    return Response.json({ code: "INVALID_LINK", message: "Invalid" }, { status: 400 })
  }
  if (token === "limited") return Response.json({ message: "Slow down" }, { status: 429 })
  if (token === "broken") return Response.json({ message: "Down" }, { status: 500 })
  if (token === "slow") await new Promise((resolve) => setTimeout(resolve, 60))
  return Response.json({
    email: "owner@example.edu",
    needsPassword: token === "has-password",
    signedInAs: token === "attacker" ? "me@example.edu" : null,
  })
}

function confirmWithPassword(body: string | undefined) {
  const { password } = parsed(body)
  if (password === "tried too often") return Response.json({ message: "No" }, { status: 429 })
  if (password !== "the password") {
    return Response.json({ code: "INVALID_PASSWORD", message: "Incorrect" }, { status: 400 })
  }
  return Response.json({ status: true, user: null })
}

let requests: Recorded[] = []
const originalFetch = globalThis.fetch

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  const body = request.method === "POST" ? await request.clone().text() : undefined
  requests.push({ url: url.pathname + url.search, method: request.method, ...(body && { body }) })
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
  if (url.pathname === "/api/auth/link-details") return linkDetails(body)
  if (url.pathname === "/api/auth/verify-email/password") return confirmWithPassword(body)
  if (url.pathname === "/api/auth/verify-email") {
    if (["has-password", "changed"].includes(url.searchParams.get("token") ?? "")) {
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

async function render(
  path: string,
  currentUser: { readonly id: string } | null = null,
  { wait = true } = {},
) {
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
  if (wait) await settle()
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

const touching = (token: string) =>
  requests.filter((r) => r.url.includes(token) || r.body?.includes(token))

const lookup = (purpose: string, token: string) => ({
  url: "/api/auth/link-details",
  method: "POST",
  body: JSON.stringify({ purpose, token }),
})

const hasButton = (container: HTMLElement) => container.querySelector("button") !== null

for (const page of [
  {
    path: "/auth/confirm",
    purpose: "confirm",
    button: /^Confirm/,
    endpoint: "/api/auth/verify-email",
    invalid: "This confirmation link is invalid or has expired.",
  },
  {
    path: "/auth/magic",
    purpose: "magic",
    button: /^Sign in/,
    endpoint: "/api/auth/magic-link/verify",
    invalid: "This sign-in link is invalid or has expired",
  },
]) {
  test(`${page.path} only reads the token until the button is clicked`, async () => {
    const container = await render(`${page.path}?token=tok-123`)
    // The page may ask what the link is for, but nothing that uses the token happens.
    expect(touching("tok-123")).toEqual([lookup(page.purpose, "tok-123")])
    expect(requests.filter((r) => r.url.startsWith(page.endpoint))).toEqual([])

    await act(() => button(container, page.button).click())
    await settle()

    expect(touching("tok-123")).toEqual([
      lookup(page.purpose, "tok-123"),
      { url: `${page.endpoint}?token=tok-123`, method: "GET" },
    ])
    // The CSRF token is bound to the session, so the page reloads it after signing in.
    expect(requests.some((r) => r.url === "/rpc/csrf-token")).toBe(true)
    expect(document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")).toBe(
      "fresh-token",
    )
  })

  test(`${page.path} shows the address the link is for before the click`, async () => {
    const container = await render(`${page.path}?token=tok-123`)
    expect(container.textContent).toContain("owner@example.edu")
    expect(container.textContent).not.toContain("signed in as")
  })

  test(`${page.path} offers nothing to click until it knows the address`, async () => {
    const container = await render(`${page.path}?token=slow`, null, { wait: false })
    expect(hasButton(container)).toBe(false)
    await settle()
    await settle()
    await settle()
    await settle()
    expect(button(container, page.button).disabled).toBe(false)
  })

  test(`${page.path} says a rejected link is invalid, as it always has`, async () => {
    const container = await render(`${page.path}?token=invalid`)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(page.invalid)
    expect(hasButton(container)).toBe(false)
  })

  for (const [token, message] of [
    ["limited", "Too many attempts"],
    ["broken", "Something went wrong"],
  ] as const) {
    test(`${page.path} offers no click when the lookup fails: ${token}`, async () => {
      const container = await render(`${page.path}?token=${token}`)
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(message)
      expect(hasButton(container)).toBe(false)
    })
  }

  test(`${page.path} makes switching accounts a deliberate choice`, async () => {
    const container = await render(`${page.path}?token=attacker`, { id: "me" })

    const notice = container.querySelector('[role="alert"]')?.textContent
    expect(notice).toContain("signed in as me@example.edu")
    expect(notice).toContain("owner@example.edu")
    expect(container.querySelector(".auth-link")?.textContent).toContain("Stay signed in")
    expect(() => button(container, page.button)).toThrow()

    await act(() => button(container, /^Switch to this account/).click())
    await settle()
    expect(requests.filter((r) => r.url.startsWith(page.endpoint))).toEqual([])

    await act(() => button(container, page.button).click())
    await settle()
    expect(requests.filter((r) => r.url.startsWith(page.endpoint))).toHaveLength(1)
  })
}

test("/auth/magic doesn't look its link up again once signed in", async () => {
  const container = await render("/auth/magic?token=tok-123")
  await act(() => button(container, /^Sign in/).click())
  await settle()
  expect(requests.filter((r) => r.url === "/api/auth/link-details")).toHaveLength(1)
})

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

/** Types into a controlled input the way a browser does. */
async function typeInto(input: HTMLInputElement, value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

const passwordField = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="password"]')!

async function enterPassword(container: HTMLElement, password: string) {
  await typeInto(passwordField(container), password)
  await act(() => submit(container))
  await settle()
}

const passwordCalls = () => requests.filter((r) => r.url === "/api/auth/verify-email/password")

test("/auth/confirm asks for an account's password before anything is clicked", async () => {
  const container = await render("/auth/confirm?token=has-password")

  expect(passwordField(container)).not.toBeNull()
  expect(button(container, /^Keep my password/).type).toBe("submit")
  expect(container.textContent).toContain("password")
  expect(requests.some((r) => r.url.startsWith("/api/auth/verify-email"))).toBe(false)
})

test("/auth/confirm keeps the password when it's right", async () => {
  const container = await render("/auth/confirm?token=has-password")

  await enterPassword(container, "the password")

  expect(passwordCalls().map((r) => r.body)).toEqual([
    JSON.stringify({ token: "has-password", password: "the password" }),
  ])
  expect(container.textContent).toContain("has now been confirmed")
  expect(container.textContent).not.toContain("password has been removed")
  expect(requests.some((r) => r.url === "/rpc/csrf-token")).toBe(true)
})

test("/auth/confirm shows a wrong password against the field, and can try again", async () => {
  const container = await render("/auth/confirm?token=has-password")

  await enterPassword(container, "a guess")

  const field = passwordField(container)
  expect(field.getAttribute("aria-invalid")).toBe("true")
  expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toContain(
    "Incorrect password",
  )
  expect(requests.some((r) => r.url === "/rpc/csrf-token")).toBe(false)

  await enterPassword(container, "the password")
  expect(container.textContent).toContain("has now been confirmed")
})

test("/auth/confirm says when password attempts are limited", async () => {
  const container = await render("/auth/confirm?token=has-password")
  await enterPassword(container, "tried too often")
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Too many attempts")
})

test("/auth/confirm continues without the password only by choice, and points to reset", async () => {
  const container = await render("/auth/confirm?token=has-password")
  expect(requests.some((r) => r.url.includes("removePassword"))).toBe(false)

  await act(() => button(container, /^Continue without password/).click())
  await settle()

  expect(requests.some((r) => r.url.includes("removePassword=true"))).toBe(true)
  expect(container.textContent).toContain("password has been removed")
  expect(container.querySelector('a[href="/reset"]')).not.toBeNull()
})

test("/auth/confirm asks for the password if the server refuses a plain click", async () => {
  const container = await render("/auth/confirm?token=changed")
  expect(container.querySelector('input[type="password"]')).toBeNull()

  await act(() => button(container, /^Confirm$/).click())
  await settle()

  expect(passwordField(container)).not.toBeNull()
  expect(requests.some((r) => r.url.includes("removePassword"))).toBe(false)
  expect(requests.some((r) => r.url === "/rpc/csrf-token")).toBe(false)
})

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
  // The password can be proved from any device, so the email can be opened anywhere.
  expect(container.textContent).not.toContain("this browser")
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
