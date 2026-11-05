import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import type { PetitionInput } from "@petitionu/domain"

GlobalRegistrator.register({ url: "http://localhost:4100/" })
// Tells React that updates are wrapped in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let payloads: PetitionInput[] = []
const originalFetch = globalThis.fetch

// SAFETY: the stub takes fetch's arguments and returns a Response; only `preconnect` is missing.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const body = await new Request(input, init).json()
  payloads.push(body.payload)
  // The tests read what the form sent; the answer doesn't matter to them.
  return new Response("", { status: 500 })
}) as typeof fetch

const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { MemoryRouter } = await import("react-router-dom")
const { PetitionOwnerControls } =
  await import("../js/features/petition/petition-owner-controls.tsx")

afterAll(async () => {
  globalThis.fetch = originalFetch
  await GlobalRegistrator.unregister()
})

afterEach(() => {
  payloads = []
  document.body.innerHTML = ""
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

async function renderEditForm(deadline: Date | null, isAuthor = true) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const client = new QueryClient()
  // Shows the petition as a refetch would, leaving the form open.
  const show = (shown: Date | null) =>
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <PetitionOwnerControls
              petition={{
                id: "00000000-0000-4000-8000-000000000001",
                title: "A better campus",
                description: "More benches",
                goal: 100,
                deadline: shown,
                allowComments: true,
                isAnonymous: false,
                isAuthor,
                status: "open",
                classroomId: null,
              }}
              canPublishUpdate
            />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    )
  await show(deadline)
  await act(() => container.querySelector<HTMLButtonElement>("#edit-petition")!.click())
  const form = container.querySelector<HTMLFormElement>("#petition-owner-edit-form")!
  return { form, show }
}

const openEditForm = async (deadline: Date | null, isAuthor = true) =>
  (await renderEditForm(deadline, isAuthor)).form

function setDeadline(form: HTMLFormElement, value: string) {
  const input = form.querySelector<HTMLInputElement>("#edit-petition-deadline")!
  // React tracks the input's value; set it through the native setter so onChange fires.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

async function submit(form: HTMLFormElement) {
  await act(() => form.requestSubmit())
  await settle()
  return payloads[0]!
}

test("an unedited form leaves a deadline with seconds alone", async () => {
  const form = await openEditForm(new Date("2026-01-02T03:04:05Z"))

  const sent = await submit(form)

  expect(sent.title).toBe("A better campus")
  expect(sent).not.toHaveProperty("deadline")
})

test("an unedited form leaves alone a deadline that changes while it's open", async () => {
  const { form, show } = await renderEditForm(new Date("2026-01-02T03:04:05Z"))
  await show(new Date("2031-06-07T08:09:10Z"))

  const sent = await submit(form)

  expect(sent.title).toBe("A better campus")
  expect(sent).not.toHaveProperty("deadline")
})

test("an unedited form leaves alone a deadline that appears while it's open", async () => {
  const { form, show } = await renderEditForm(null)
  await show(new Date("2031-06-07T08:09:10Z"))

  const sent = await submit(form)

  expect(sent.title).toBe("A better campus")
  expect(sent).not.toHaveProperty("deadline")
})

test("an edited deadline is sent", async () => {
  const form = await openEditForm(new Date("2026-01-02T03:04:05Z"))
  await act(() => setDeadline(form, "2030-05-06T07:08"))

  const sent = await submit(form)

  expect(sent.deadline).toBe(new Date("2030-05-06T07:08").toISOString())
})

test("a cleared deadline is sent as null", async () => {
  const form = await openEditForm(new Date("2026-01-02T03:04:05Z"))
  await act(() => setDeadline(form, ""))

  const sent = await submit(form)

  expect(sent.deadline).toBeNull()
})

test("the author can hide their name", async () => {
  const form = await openEditForm(null)
  expect(form.querySelector("#edit-petition-anonymous")).not.toBeNull()
  expect((await submit(form)).isAnonymous).toBe(false)
})

test("a professor editing a student's petition can't touch or send its anonymity", async () => {
  const form = await openEditForm(null, false)
  expect(form.querySelector("#edit-petition-anonymous")).toBeNull()
  expect(form.textContent).not.toContain("Hiding your name")
  const payload = await submit(form)
  expect(payload).not.toHaveProperty("isAnonymous")
  expect(payload).toMatchObject({ title: "A better campus", goal: 100, allowComments: true })
})
