import { Context, Schema } from "effect"
import { RpcMiddleware } from "effect/rpc"
import { Unauthenticated } from "./Errors.ts"

export const Role = Schema.Literals(["student", "professor", "admin", "superadmin"])
export type Role = typeof Role.Type

/** A signed-in caller, loaded from the `users` row of their session. */
export interface SignedIn {
  readonly _tag: "SignedIn"
  readonly id: string
  readonly email: string
  readonly role: Role
  readonly organizationId: string | null
  readonly confirmedAt: Date | null
  readonly firstName: string | null
  readonly lastName: string | null
}

/** A caller without a session. */
export interface Guest {
  readonly _tag: "Guest"
}

export type Actor = SignedIn | Guest

/** Who is calling: a signed-in user or a guest. Every procedure can read it. */
export class CurrentActor extends Context.Service<CurrentActor, Actor>()(
  "petitionu/CurrentActor",
) {}

/** The signed-in caller, for procedures that use `RequireUser`. */
export class CurrentUser extends Context.Service<CurrentUser, SignedIn>()(
  "petitionu/CurrentUser",
) {}

/**
 * Provides `CurrentActor`. Every area's group applies it with `.middleware(ActorMiddleware)`
 * after its procedures.
 */
export class ActorMiddleware extends RpcMiddleware.Service<
  ActorMiddleware,
  { provides: CurrentActor }
>()("petitionu/ActorMiddleware") {}

/** Marks a procedure as sign-in only: guests get `Unauthenticated`; provides `CurrentUser`. */
export class RequireUser extends RpcMiddleware.Service<
  RequireUser,
  { provides: CurrentUser; requires: CurrentActor }
>()("petitionu/RequireUser", { error: Unauthenticated }) {}
