import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit, Layer, Logger } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { AppConfig } from "../src/Config.ts"
import {
  classroomInviteEmail,
  confirmationEmail,
  magicLinkEmail,
  membershipApprovalEmail,
  passwordResetEmail,
} from "../src/Email.ts"
import { Mailer } from "../src/Mailer.ts"
import { MemoryMailer, linksIn } from "./support/external.ts"

const publicHost = "petition.campus.test"

const resendEnv = {
  RESEND_API_KEY: "re_secret",
  MAIL_FROM: "mail@campus.test",
  SUPPORT_EMAIL: "help@campus.test",
}

interface ResendCall {
  readonly url: string
  readonly authorization: string | undefined
  readonly body: Record<string, unknown>
}

/** A stand-in for the Resend API that records each request and answers with `status`. */
const fakeResend = (calls: Array<ResendCall>, status = 200) =>
  Layer.succeed(HttpClient.HttpClient)(
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        assert.strictEqual(request.body._tag, "Uint8Array")
        const bytes = request.body._tag === "Uint8Array" ? request.body.body : new Uint8Array()
        calls.push({
          url: url.toString(),
          authorization: request.headers["authorization"],
          body: JSON.parse(new TextDecoder().decode(bytes)),
        })
        const body = status === 200 ? { id: "email_1" } : { message: "invalid" }
        return HttpClientResponse.fromWeb(request, Response.json(body, { status }))
      }),
    ),
  )

const mailerWith = (env: Record<string, string>, http: Layer.Layer<HttpClient.HttpClient>) =>
  Mailer.layer.pipe(
    Layer.provide([AppConfig.layer({ webDistDir: "unused" }), http]),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          DATABASE_URL: "postgres://unused",
          PUBLIC_HOST: "petitionu.test",
          ...env,
        }),
      ),
    ),
  )

describe("Mailer through Resend", () => {
  it.effect(
    "authentication emails use the configured sender, support, recipient, and acceptance URL",
    () =>
      Effect.gen(function* () {
        const calls: Array<ResendCall> = []
        const emails = [
          magicLinkEmail({ publicHost, to: "student@campus.test", path: "/magic_link/test-token" }),
          confirmationEmail({
            publicHost,
            to: "student@campus.test",
            path: "/confirm_new_user/test-token",
          }),
          passwordResetEmail({
            publicHost,
            to: "student@campus.test",
            path: "/password-reset/test-token",
          }),
        ]
        yield* Effect.forEach(emails, (email) => Mailer.use((mailer) => mailer.send(email))).pipe(
          Effect.provide(mailerWith(resendEnv, fakeResend(calls))),
        )

        assert.deepStrictEqual(
          calls.map((call) => call.body["subject"]),
          ["Your login link", "Confirm your email address", "Reset your password"],
        )
        for (const [call, path] of calls.map(
          (call, i) =>
            [call, ["/magic_link/", "/confirm_new_user/", "/password-reset/"][i]] as const,
        )) {
          assert.strictEqual(call.url, "https://api.resend.com/emails")
          assert.strictEqual(call.authorization, "Bearer re_secret")
          assert.strictEqual(call.body["from"], "PetitionU <mail@campus.test>")
          assert.strictEqual(call.body["reply_to"], "help@campus.test")
          assert.deepStrictEqual(call.body["to"], ["student@campus.test"])
          assert.include(
            String(call.body["html"]),
            `href="https://petition.campus.test${path}test-token"`,
          )
        }
      }),
  )

  it.effect("fails with a MailError when Resend rejects the message", () =>
    Effect.gen(function* () {
      const error = yield* Mailer.use((mailer) =>
        mailer.send(confirmationEmail({ publicHost, to: "a@campus.test", path: "/confirm/x" })),
      ).pipe(Effect.provide(mailerWith(resendEnv, fakeResend([], 422))), Effect.flip)
      assert.strictEqual(error._tag, "MailError")
    }),
  )

  it.effect("refuses to start when Resend is configured without valid addresses", () =>
    Effect.gen(function* () {
      for (const [name, env] of [
        ["MAIL_FROM", { RESEND_API_KEY: "re_secret", SUPPORT_EMAIL: "help@campus.test" }],
        ["MAIL_FROM", { ...resendEnv, MAIL_FROM: "PetitionU <mail@campus.test>" }],
        ["SUPPORT_EMAIL", { RESEND_API_KEY: "re_secret", MAIL_FROM: "mail@campus.test" }],
      ] as const) {
        const exit = yield* Layer.build(mailerWith(env, fakeResend([]))).pipe(
          Effect.scoped,
          Effect.exit,
        )
        assert.isTrue(Exit.isFailure(exit), name)
        assert.include(String(exit), name)
      }
    }),
  )
})

describe("Mailer without Resend", () => {
  const captureLogs = (lines: Array<string>) =>
    Logger.layer([Logger.make(({ message }) => void lines.push(JSON.stringify(message)))])

  it.effect("in development, logs messages with links redacted from the subject", () =>
    Effect.gen(function* () {
      const lines: Array<string> = []
      yield* Mailer.use((mailer) =>
        mailer.send({
          to: "a@campus.test",
          subject: "Open https://petition.campus.test/secret-token now",
          html: '<a href="https://petition.campus.test/confirm/abc">go</a>',
        }),
      ).pipe(
        Effect.provide(mailerWith({ NODE_ENV: "development" }, fakeResend([]))),
        Effect.provide(captureLogs(lines)),
      )
      const logged = lines.join("\n")
      assert.include(logged, "a@campus.test")
      assert.include(logged, "Open [link] now")
      assert.notInclude(logged, "secret-token")
      assert.include(logged, "https://petition.campus.test/confirm/abc")
    }),
  )

  it.effect("outside development, refuses to start without RESEND_API_KEY", () =>
    Effect.gen(function* () {
      const error = yield* Mailer.use((mailer) =>
        mailer.send(confirmationEmail({ publicHost, to: "a@campus.test", path: "/confirm/abc" })),
      ).pipe(Effect.provide(mailerWith({}, fakeResend([]))), Effect.flip)
      assert.strictEqual(error._tag, "MailerConfigError")
      assert.include(error.message, "RESEND_API_KEY")
    }),
  )
})

describe("email templates", () => {
  it.effect("classroom mail escapes user content and links to the app", () =>
    Effect.gen(function* () {
      const mailbox = yield* MemoryMailer
      const user = { to: "student@campus.test", firstName: "<script>" }
      const classroom = { name: "<b>Class</b>", description: "<img src=x>" }
      yield* Mailer.use((mailer) =>
        Effect.all([
          mailer.send(classroomInviteEmail({ publicHost, ...user, classroom, invitedBy: null })),
          mailer.send(membershipApprovalEmail({ publicHost, ...user, classroom })),
        ]),
      )

      const messages = yield* mailbox.messages
      assert.deepStrictEqual(
        messages.map((m) => [m.to, m.subject]),
        [
          ["student@campus.test", "You've been invited to join <b>Class</b>"],
          ["student@campus.test", "You've been approved to join <b>Class</b>"],
        ],
      )
      for (const message of messages) {
        assert.include(message.html, "&lt;b&gt;Class&lt;/b&gt;")
        assert.notInclude(message.html, "<script>")
        assert.notInclude(message.html, "<img")
        assert.deepStrictEqual(linksIn(message), ["https://petition.campus.test/"])
      }
      assert.include(messages[0]!.html, "A professor has invited you")
    }).pipe(Effect.provide(MemoryMailer.layer)),
  )

  it("names the inviter when known", () => {
    const email = classroomInviteEmail({
      publicHost,
      to: "student@campus.test",
      firstName: null,
      classroom: { name: "Civics", description: null },
      invitedBy: { firstName: "Ada", lastName: null },
    })
    assert.include(email.html, "<p>Hello!</p>")
    assert.include(email.html, "Ada has invited you")
    assert.notInclude(email.html, "<em>")
  })

  it("greets magic-link recipients by escaped email and links with https", () => {
    const email = magicLinkEmail({ publicHost, to: "a&b@campus.test", path: "/magic_link/t" })
    assert.include(email.html, "Hello, a&amp;b@campus.test!")
    assert.deepStrictEqual(linksIn(email), ["https://petition.campus.test/magic_link/t"])
  })
})
