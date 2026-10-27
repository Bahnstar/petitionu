import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import type { Browser } from "./support/browser.ts"
import { makeBrowser } from "./support/browser.ts"
import {
  createClassroom,
  createProfessor,
  createStudent,
  failure,
  ok,
  seedMembership,
} from "./support/classrooms.ts"
import { makeTestApp, type TestApp, testOrigin } from "./support/harness.ts"

const join = (user: { readonly browser: Browser }, joinCode: string) =>
  user.browser.rpc((api) => api.joinClassroomByCode({ joinCode }))

/** A professor, a student on another campus, and the professor's classroom "Civics". */
const setup = Effect.gen(function* () {
  const app = yield* makeTestApp()
  const professor = yield* createProfessor(app)
  const student = yield* createStudent(app)
  const classroom = yield* createClassroom(professor)
  return { app, professor, student, classroom }
})

const membershipStatus = (app: TestApp, id: string) =>
  Effect.map(
    app.sql<{ status: string }>`SELECT status FROM classroom_memberships WHERE id = ${id}`,
    (rows) => rows[0]?.status,
  ).pipe(Effect.orDie)

describe("joining a classroom", () => {
  it.live("a confirmed outsider joins by code and can then read the classroom", () =>
    Effect.gen(function* () {
      const { student, classroom } = yield* setup
      const before = yield* failure(
        yield* student.browser.rpc((api) => api.getClassroomById({ id: classroom.id })),
      )
      assert.strictEqual(before[0]!.type, "not_found")

      const membership = yield* ok(yield* join(student, classroom.joinCode))
      assert.strictEqual(membership.userId, student.id)
      assert.strictEqual(membership.role, "student")
      assert.strictEqual(membership.status, "active")
      assert.isNotNull(membership.joinedAt)
      assert.deepStrictEqual(membership.classroom, { id: classroom.id, name: "Civics" })

      const joined = yield* ok(
        yield* student.browser.rpc((api) => api.getClassroomById({ id: classroom.id })),
      )
      assert.strictEqual(joined.id, classroom.id)
      assert.strictEqual(joined.memberCount, 1)
    }),
  )

  it.live("guests and unconfirmed users cannot join", () =>
    Effect.gen(function* () {
      const { app, classroom } = yield* setup
      const guest = yield* makeBrowser(app)
      const asGuest = yield* failure(yield* join({ browser: guest }, classroom.joinCode))
      assert.strictEqual(asGuest[0]!.type, "unauthenticated")

      const unconfirmed = yield* createStudent(app, { stage: "unconfirmed" })
      const asUnconfirmed = yield* failure(yield* join(unconfirmed, classroom.joinCode))
      assert.strictEqual(asUnconfirmed[0]!.type, "forbidden")
    }),
  )

  it.live("invalid and archived codes do not grant membership", () =>
    Effect.gen(function* () {
      const { professor, student, classroom } = yield* setup
      const invalidCode = {
        type: "invalid",
        field: "joinCode",
        message: "Invalid or archived join code",
      }
      assert.deepStrictEqual(yield* failure(yield* join(student, crypto.randomUUID())), [
        invalidCode,
      ])
      assert.deepStrictEqual(yield* failure(yield* join(student, "not-a-code")), [invalidCode])

      yield* ok(yield* professor.browser.rpc((api) => api.archiveClassroom({ id: classroom.id })))
      assert.deepStrictEqual(yield* failure(yield* join(student, classroom.joinCode)), [
        invalidCode,
      ])
      const request = yield* failure(
        yield* student.browser.rpc((api) =>
          api.requestToJoinClassroom({ classroomId: classroom.id }),
        ),
      )
      assert.deepStrictEqual(request, [
        {
          type: "invalid",
          field: "classroomId",
          message: "Classroom is unavailable or archived",
        },
      ])
    }),
  )

  it.live("active, pending and removed rows cannot be replaced by a join", () =>
    Effect.gen(function* () {
      const { app, student, classroom } = yield* setup
      for (const [status, message] of [
        ["active", "You are already a member of this classroom"],
        ["pending", "Your membership is awaiting approval"],
        ["removed", "Your membership was removed; contact the professor"],
      ] as const) {
        const id = yield* seedMembership(app, classroom.id, student.id, status)
        assert.deepStrictEqual(yield* failure(yield* join(student, classroom.joinCode)), [
          { type: "invalid", field: "classroomId", message },
        ])
        assert.strictEqual(yield* membershipStatus(app, id), status)
        yield* app.sql`DELETE FROM classroom_memberships WHERE id = ${id}`.pipe(Effect.orDie)
      }
    }),
  )

  it.live("the professor does not acquire a duplicate student membership", () =>
    Effect.gen(function* () {
      const { professor, classroom } = yield* setup
      assert.deepStrictEqual(yield* failure(yield* join(professor, classroom.joinCode)), [
        {
          type: "invalid",
          field: "classroomId",
          message: "The professor already owns this classroom",
        },
      ])
    }),
  )

  it.live("a join ignores a browser-supplied identity and role", () =>
    Effect.gen(function* () {
      const { professor, student, classroom } = yield* setup
      const response = yield* student.browser.request("/rpc", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": yield* student.browser.reloadCsrf,
          origin: testOrigin,
        },
        body: JSON.stringify({
          _tag: "Request",
          id: "1",
          tag: "joinClassroomByCode",
          payload: { joinCode: classroom.joinCode, role: "ta", userId: professor.id },
          headers: [],
        }),
      })
      const [message] = (yield* Effect.promise(() => response.json())) as Array<{ exit: any }>
      assert.strictEqual(message!.exit._tag, "Success")
      assert.strictEqual(message!.exit.value.userId, student.id)
      assert.strictEqual(message!.exit.value.role, "student")
    }),
  )

  it.live("joining doesn't open other classrooms to an outsider", () =>
    Effect.gen(function* () {
      const { student } = yield* setup
      assert.deepStrictEqual(
        yield* ok(yield* student.browser.rpc((api) => api.getClassrooms())),
        [],
      )
    }),
  )
})

describe("invitations and requests", () => {
  it.live("the professor invites and approves without exposing private user fields", () =>
    Effect.gen(function* () {
      const { app, professor, student, classroom } = yield* setup
      const invited = yield* ok(
        yield* professor.browser.rpc((api) =>
          api.inviteToClassroom({ classroomId: classroom.id, email: student.email.toUpperCase() }),
        ),
      )
      assert.strictEqual(invited.status, "pending")
      assert.strictEqual(invited.role, "student")
      assert.strictEqual(invited.invitedById, professor.id)
      assert.deepStrictEqual(invited.user, { id: student.id })
      const invite = yield* app.mailer.lastTo(student.email)
      assert.strictEqual(invite.subject, "You've been invited to join Civics")
      assert.include(invite.html, "Pat Professor has invited you")
      assert.include(invite.html, 'href="https://petitionu.test/"')

      const approved = yield* ok(
        yield* professor.browser.rpc((api) => api.approveMembership({ id: invited.id })),
      )
      assert.strictEqual(approved.status, "active")
      assert.isNotNull(approved.joinedAt)
      assert.deepStrictEqual(approved.user, { id: student.id })
      const approval = yield* app.mailer.lastTo(student.email)
      assert.strictEqual(approval.subject, "You've been approved to join Civics")
      assert.include(approval.html, "Hello Test!")
    }),
  )

  it.live("inviting an unknown email reports the field", () =>
    Effect.gen(function* () {
      const { professor, classroom } = yield* setup
      const errors = yield* failure(
        yield* professor.browser.rpc((api) =>
          api.inviteToClassroom({ classroomId: classroom.id, email: "nobody@example.edu" }),
        ),
      )
      assert.deepStrictEqual(errors, [
        { type: "invalid", field: "email", message: "User not found" },
      ])
    }),
  )

  it.live("outsiders cannot invite, and archived classrooms do not accept invitations", () =>
    Effect.gen(function* () {
      const { app, professor, student, classroom } = yield* setup
      const invitee = yield* createStudent(app)
      const input = { classroomId: classroom.id, email: invitee.email }
      const outsider = yield* failure(
        yield* student.browser.rpc((api) => api.inviteToClassroom(input)),
      )
      assert.strictEqual(outsider[0]!.type, "forbidden")

      yield* ok(yield* professor.browser.rpc((api) => api.archiveClassroom({ id: classroom.id })))
      assert.deepStrictEqual(
        yield* failure(yield* professor.browser.rpc((api) => api.inviteToClassroom(input))),
        [
          {
            type: "invalid",
            field: "classroomId",
            message: "Classroom is unavailable or archived",
          },
        ],
      )
      assert.strictEqual(
        (yield* app.mailer.messages).filter((email) => email.to === invitee.email).length,
        1,
        "only the confirmation email",
      )
    }),
  )

  it.live("requests require confirmation and never revive removed memberships", () =>
    Effect.gen(function* () {
      const { app, professor, student, classroom } = yield* setup
      const input = { classroomId: classroom.id }
      const guest = yield* makeBrowser(app)
      const asGuest = yield* failure(yield* guest.rpc((api) => api.requestToJoinClassroom(input)))
      assert.strictEqual(asGuest[0]!.type, "unauthenticated")
      const unconfirmed = yield* createStudent(app, { stage: "unconfirmed" })
      const asUnconfirmed = yield* failure(
        yield* unconfirmed.browser.rpc((api) => api.requestToJoinClassroom(input)),
      )
      assert.strictEqual(asUnconfirmed[0]!.type, "forbidden")

      const requested = yield* ok(
        yield* student.browser.rpc((api) => api.requestToJoinClassroom(input)),
      )
      assert.strictEqual(requested.status, "pending")
      assert.isNull(requested.joinedAt)
      const pending = yield* ok(
        yield* professor.browser.rpc((api) =>
          api.getPendingMemberships({ classroomId: classroom.id }),
        ),
      )
      assert.deepStrictEqual(
        pending.map((membership) => membership.id),
        [requested.id],
      )

      const removed = yield* ok(
        yield* professor.browser.rpc((api) => api.removeFromClassroom({ id: requested.id })),
      )
      assert.strictEqual(removed.status, "removed")
      assert.deepStrictEqual(
        yield* failure(yield* student.browser.rpc((api) => api.requestToJoinClassroom(input))),
        [
          {
            type: "invalid",
            field: "classroomId",
            message: "Your membership was removed; contact the professor",
          },
        ],
      )
      const approve = yield* failure(
        yield* professor.browser.rpc((api) => api.approveMembership({ id: requested.id })),
      )
      assert.strictEqual(approve[0]!.type, "forbidden")
    }),
  )

  it.live("archiving also blocks approval of an existing pending request", () =>
    Effect.gen(function* () {
      const { app, professor, student, classroom } = yield* setup
      const id = yield* seedMembership(app, classroom.id, student.id, "pending")
      yield* ok(yield* professor.browser.rpc((api) => api.archiveClassroom({ id: classroom.id })))
      const errors = yield* failure(
        yield* professor.browser.rpc((api) => api.approveMembership({ id })),
      )
      assert.strictEqual(errors[0]!.type, "forbidden")
      assert.strictEqual(yield* membershipStatus(app, id), "pending")
    }),
  )
})

describe("teaching assistants", () => {
  it.live("TA authority does not extend to promotion or another classroom", () =>
    Effect.gen(function* () {
      const { app, student, classroom } = yield* setup
      const ta = yield* createStudent(app)
      yield* seedMembership(app, classroom.id, ta.id, "active", "ta")
      const member = yield* seedMembership(app, classroom.id, student.id, "active")
      const promote = yield* failure(
        yield* ta.browser.rpc((api) => api.promoteToTa({ id: member })),
      )
      assert.strictEqual(promote[0]!.type, "forbidden")

      const invitee = yield* createStudent(app)
      const inviteTa = yield* failure(
        yield* ta.browser.rpc((api) =>
          api.inviteToClassroom({ classroomId: classroom.id, email: invitee.email, role: "ta" }),
        ),
      )
      assert.strictEqual(inviteTa[0]!.type, "forbidden")

      const otherProfessor = yield* createProfessor(app)
      const other = yield* createClassroom(otherProfessor, { name: "Other" })
      const otherMember = yield* seedMembership(app, other.id, invitee.id, "pending")
      for (const result of [
        yield* ta.browser.rpc((api) => api.approveMembership({ id: otherMember })),
        yield* ta.browser.rpc((api) => api.removeFromClassroom({ id: otherMember })),
      ]) {
        assert.strictEqual((yield* failure(result))[0]!.type, "not_found")
      }
      assert.strictEqual(yield* membershipStatus(app, otherMember), "pending")
    }),
  )

  it.live("active TAs invite students and approve them; only the professor changes roles", () =>
    Effect.gen(function* () {
      const { app, professor, student, classroom } = yield* setup
      const ta = yield* createStudent(app)
      yield* seedMembership(app, classroom.id, ta.id, "active", "ta")

      const invited = yield* ok(
        yield* ta.browser.rpc((api) =>
          api.inviteToClassroom({ classroomId: classroom.id, email: student.email }),
        ),
      )
      assert.strictEqual(invited.invitedById, ta.id)
      assert.include((yield* app.mailer.lastTo(student.email)).html, "Test Member has invited you")
      const approved = yield* ok(
        yield* ta.browser.rpc((api) => api.approveMembership({ id: invited.id })),
      )
      assert.strictEqual(approved.status, "active")

      const demote = yield* failure(
        yield* ta.browser.rpc((api) => api.demoteToStudent({ id: approved.id })),
      )
      assert.strictEqual(demote[0]!.type, "forbidden")
      const promoted = yield* ok(
        yield* professor.browser.rpc((api) => api.promoteToTa({ id: approved.id })),
      )
      assert.strictEqual(promoted.role, "ta")
      const demoted = yield* ok(
        yield* professor.browser.rpc((api) => api.demoteToStudent({ id: approved.id })),
      )
      assert.strictEqual(demoted.role, "student")
    }),
  )

  it.live("the professor invites TAs", () =>
    Effect.gen(function* () {
      const { professor, student, classroom } = yield* setup
      const invited = yield* ok(
        yield* professor.browser.rpc((api) =>
          api.inviteToClassroom({ classroomId: classroom.id, email: student.email, role: "ta" }),
        ),
      )
      assert.strictEqual(invited.role, "ta")
      assert.strictEqual(invited.status, "pending")
    }),
  )
})

describe("rosters and leaving", () => {
  it.live("an authorized roster shows names without opening other members' rows", () =>
    Effect.gen(function* () {
      const { app, professor, student, classroom } = yield* setup
      const id = yield* seedMembership(app, classroom.id, student.id, "active")
      const roster = yield* ok(
        yield* professor.browser.rpc((api) =>
          api.getMembershipsForClassroom({ classroomId: classroom.id }),
        ),
      )
      assert.strictEqual(roster.length, 1)
      assert.strictEqual(roster[0]!.memberName, "Test Member")
      assert.deepStrictEqual(roster[0]!.user, { id: student.id })
      assert.notProperty(roster[0]!.user, "email")

      const classmate = yield* createStudent(app)
      yield* seedMembership(app, classroom.id, classmate.id, "active")
      const own = yield* ok(
        yield* classmate.browser.rpc((api) =>
          api.getMembershipsForClassroom({ classroomId: classroom.id }),
        ),
      )
      assert.deepStrictEqual(
        own.map((membership) => membership.userId),
        [classmate.id],
      )
      const outsider = yield* createStudent(app)
      const visible = yield* ok(yield* outsider.browser.rpc((api) => api.getClassroomMemberships()))
      assert.isFalse(visible.some((membership) => membership.id === id))
    }),
  )

  it.live("students leave only their own active membership and lose classroom access", () =>
    Effect.gen(function* () {
      const { app, student, classroom } = yield* setup
      const member = yield* seedMembership(app, classroom.id, student.id, "active")
      const classmate = yield* createStudent(app)
      const other = yield* seedMembership(app, classroom.id, classmate.id, "active")

      const removeOther = yield* failure(
        yield* student.browser.rpc((api) => api.removeFromClassroom({ id: other })),
      )
      assert.strictEqual(removeOther[0]!.type, "not_found")
      const left = yield* ok(
        yield* student.browser.rpc((api) => api.removeFromClassroom({ id: member })),
      )
      assert.strictEqual(left.status, "removed")

      const read = yield* failure(
        yield* student.browser.rpc((api) => api.getClassroomById({ id: classroom.id })),
      )
      assert.strictEqual(read[0]!.type, "not_found")
      const mine = yield* ok(yield* student.browser.rpc((api) => api.getMyClassrooms({})))
      assert.strictEqual(mine.count, 0)
      assert.deepStrictEqual(mine.results, [])
    }),
  )

  it.live("students cannot remove their pending or already removed memberships", () =>
    Effect.gen(function* () {
      const { app, classroom } = yield* setup
      for (const status of ["pending", "removed"] as const) {
        const member = yield* createStudent(app)
        const id = yield* seedMembership(app, classroom.id, member.id, status)
        const errors = yield* failure(
          yield* member.browser.rpc((api) => api.removeFromClassroom({ id })),
        )
        assert.strictEqual(errors[0]!.type, "forbidden")
        assert.strictEqual(yield* membershipStatus(app, id), status)
      }
    }),
  )
})
