import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { expect, test } from "bun:test"
import type { PetitionDto } from "@petitionu/domain"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"

GlobalRegistrator.register({ url: "http://localhost:4100/" })

const { plural } = await import("@/lib/utils")
const { PetitionCard } = await import("../js/features/petition/petition-card")

const yesterday = new Date(Date.now() - 86_400_000)

// SAFETY: the card reads only the fields set here.
const petition = (fields: Partial<PetitionDto>) =>
  ({
    id: "petition-1",
    title: "Open the library later",
    description: "Late labs and long commutes.",
    status: "open",
    goal: 100,
    signaturesCount: 5,
    deadline: null,
    ...fields,
  }) as PetitionDto

const card = (fields: Partial<PetitionDto>) => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <PetitionCard petition={petition(fields)} />
    </MemoryRouter>,
  )
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
}

test("plural keeps the singular for one and adds an s otherwise", () => {
  expect(plural(1, "member")).toBe("member")
  expect(plural(0, "member")).toBe("members")
  expect(plural(2, "member")).toBe("members")
})

test("a card counts one signature in the singular", () => {
  expect(card({ goal: null, signaturesCount: 1 })).toContain("1 signature")
  expect(card({ goal: null, signaturesCount: 1 })).not.toContain("1 signatures")
  expect(card({ goal: 1, signaturesCount: 1 })).toContain("1 of 1 signature")
  expect(card({ goal: 1, signaturesCount: 1 })).not.toContain("1 of 1 signatures")
  expect(card({ goal: 100, signaturesCount: 1 })).toContain("1 of 100 signatures")
})

test("a victory card says Victory and never Closed", () => {
  for (const deadline of [null, yesterday]) {
    const text = card({ status: "victory", deadline })
    expect(text).toContain("Victory")
    expect(text).not.toContain("Closed")
    expect(text).not.toContain("left")
  }
})

test("a closed card and a card past its deadline still say Closed", () => {
  expect(card({ status: "closed" })).toContain("Closed")
  expect(card({ status: "open", deadline: yesterday })).toContain("Closed")
})
