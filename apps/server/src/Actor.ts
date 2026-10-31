import {
  type Actor,
  ActorMiddleware,
  CurrentActor,
  CurrentUser,
  RequireUser,
  Role,
  Unauthenticated,
} from "@petitionu/domain"
import { Cause, Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { SqlClient, SqlSchema } from "effect/sql"
import { Auth } from "./Auth.ts"
import { Csrf } from "./Csrf.ts"
import { internalError } from "./RpcDefects.ts"

const guest: Actor = { _tag: "Guest" }

const ActorRow = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  role: Role,
  organizationId: Schema.NullOr(Schema.String),
  confirmedAt: Schema.NullOr(Schema.Date),
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
  emailVerified: Schema.Boolean,
})

/**
 * Guards `POST /rpc` and resolves the caller. Runs on the real HTTP request, before the body
 * is decoded, so headers a client puts in RPC messages can't affect it:
 * - rejects the request with 403 unless it passes the CSRF checks;
 * - provides `CurrentActor`: the user of the Better Auth session in the request's cookie, or
 *   a guest.
 */
export const RpcRequestGuard = HttpRouter.middleware(
  Effect.gen(function* () {
    const auth = yield* Auth
    const csrf = yield* Csrf
    const sql = yield* SqlClient.SqlClient
    const findUser = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: ActorRow,
      execute: (id) => sql`
        SELECT id, email::text AS email, role, organization_id,
          (confirmed_at AT TIME ZONE 'utc') AS confirmed_at, first_name, last_name, email_verified
        FROM users WHERE id = ${id}
      `,
    })
    const loadActor = Effect.fnUntraced(function* (userId: string) {
      let row = yield* findUser(userId).pipe(Effect.orDie)
      if (Option.isSome(row) && row.value.emailVerified && row.value.confirmedAt === null) {
        yield* auth.finishConfirmation(userId)
        row = yield* findUser(userId).pipe(Effect.orDie)
      }
      return Option.match(row, {
        onNone: (): Actor => guest,
        onSome: (user): Actor => ({
          _tag: "SignedIn",
          id: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          confirmedAt: user.confirmedAt,
          firstName: user.firstName,
          lastName: user.lastName,
        }),
      })
    })

    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const session = yield* auth.getSession(new Headers(request.headers))
        if (!csrf.check(request, session)) {
          return HttpServerResponse.jsonUnsafe({ error: "Forbidden" }, { status: 403 })
        }
        const actor = Option.isNone(session) ? guest : yield* loadActor(session.value.userId)
        return yield* Effect.provideService(httpEffect, CurrentActor, actor)
      })
  }),
).layer

/**
 * Hands the `CurrentActor` resolved by `RpcRequestGuard` to procedures. Fails closed: if the
 * guard didn't run, the procedure dies rather than run as anyone.
 *
 * Every procedure runs inside this middleware, so it also logs a procedure's defects with their
 * stack and cause chain, while the procedure's name is known, and hands on `internalError`.
 */
export const ActorMiddlewareLive = Layer.succeed(ActorMiddleware)((effect, { rpc }) =>
  Effect.flatMap(Effect.serviceOption(CurrentActor), (actor) =>
    Option.isSome(actor)
      ? Effect.provideService(effect, CurrentActor, actor.value)
      : Effect.die(new Error("CurrentActor was not resolved for this request")),
  ).pipe(
    Effect.catchCause((cause) =>
      Cause.hasDies(cause)
        ? Effect.logError("RPC procedure died", cause).pipe(
            Effect.annotateLogs({ rpc: rpc._tag }),
            Effect.andThen(Effect.die(internalError)),
          )
        : Effect.failCause(cause),
    ),
  ),
)

/** Lets only signed-in callers through and provides them as `CurrentUser`. */
export const RequireUserLive = Layer.succeed(RequireUser)((effect) =>
  Effect.gen(function* () {
    const actor = yield* CurrentActor
    if (actor._tag !== "SignedIn") {
      return yield* new Unauthenticated({ message: "Sign in to access petition activity." })
    }
    return yield* Effect.provideService(effect, CurrentUser, actor)
  }),
)
