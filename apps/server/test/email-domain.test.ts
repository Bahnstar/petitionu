import { EmailDomain } from "@petitionu/domain"
import { assert, describe, it } from "@effect/vitest"

describe("EmailDomain", () => {
  it("normalizes email hosts and rejects personal providers and malformed hosts", () => {
    assert.strictEqual(EmailDomain.fromEmail("Alex@Students.SCHOOL.EDU"), "students.school.edu")

    for (const email of [
      "alex@gmail.com",
      "alex@OUTLOOK.COM",
      "missing-at",
      "@school.edu",
      "alex@@school.edu",
      "alex@-school.edu",
      "alex@school..edu",
      "alex@localhost",
      "alex@school.edu.attacker.com/path",
    ]) {
      assert.isUndefined(EmailDomain.fromEmail(email), email)
    }
  })

  it("groups only supported academic suffixes without confusing public suffixes", () => {
    assert.strictEqual(EmailDomain.schoolDomain("school.edu"), "school.edu")
    assert.strictEqual(EmailDomain.schoolDomain("students.school.edu"), "school.edu")
    assert.strictEqual(EmailDomain.schoolDomain("students.school.ac.uk"), "school.ac.uk")

    for (const host of [
      "ac.uk",
      "edu",
      "school.org",
      "school.edu.attacker.com",
      "school.ac.uk.evil",
    ]) {
      assert.isUndefined(EmailDomain.schoolDomain(host), host)
    }
  })
})
