import { Layer } from "effect"
import type { HttpRouter } from "effect/http"
import { Auth, AuthRoutes } from "./Auth.ts"
import { BodyLimit } from "./BodyLimit.ts"
import { CampusAssignmentLive } from "./Campus.ts"
import { AppConfig } from "./Config.ts"
import { Csrf, CsrfRoutes, SessionShellHead } from "./Csrf.ts"
import { DatabaseLive } from "./Database.ts"
import { HealthRoutes } from "./Health.ts"
import { MailerLive } from "./Mailer.ts"
import { RpcRoutes } from "./Rpc.ts"
import { SchoolRegistry } from "./SchoolRegistry.ts"
import { SchoolVerification, SchoolVerificationQueue } from "./SchoolVerification.ts"
import { ShellRoutes, StaticRoutes } from "./Web.ts"

/**
 * Composition point for HTTP routes. Each feature area adds one line for its route layer.
 */
export const AppRoutes = Layer.mergeAll(
  HealthRoutes,
  AuthRoutes.pipe(Layer.provide(BodyLimit)),
  CsrfRoutes,
  RpcRoutes,
  ShellRoutes.pipe(Layer.provide(SessionShellHead)),
  StaticRoutes,
)

/**
 * What runs when a user becomes confirmed: a layer providing `UserConfirmed` (see
 * `Confirmation.ts`): campus assignment.
 */
export const UserConfirmedLive = CampusAssignmentLive

/**
 * Composition point for internal services shared by the routes (database, queue, auth, ...).
 * Each feature area adds one line for its service layer.
 */
const makeAppServices = (userConfirmed: Layer.Layer<never, unknown, BaseServiceTypes>) =>
  Layer.mergeAll(Auth.layer, Csrf.layer, SchoolVerification.worker).pipe(
    Layer.provide(SchoolVerificationQueue.layer),
    Layer.provide(userConfirmed),
    Layer.provideMerge(DatabaseLive),
  )

export const AppServices = makeAppServices(UserConfirmedLive)

/** Services available to `UserConfirmed`: database, config, mail and the school registry. */
export type BaseServiceTypes =
  | Layer.Success<typeof DatabaseLive>
  | AppConfig
  | Layer.Success<typeof ExternalServicesLive>

/** Every service the routes may use, for layers passed in as extra `routes`. */
export type AppServiceTypes = Auth | Csrf | BaseServiceTypes

/**
 * Services that reach outside the process and that tests replace with fakes
 * (Mailer, SchoolRegistry).
 */
export const ExternalServicesLive = Layer.mergeAll(MailerLive, SchoolRegistry.layer)

/**
 * The whole application as a router layer. `serve` runs it on Node; tests turn it into an
 * in-process web handler. Configuration comes from the ambient `ConfigProvider`.
 * `routes` adds router layers, e.g. a test-only RPC group; `userConfirmed` replaces
 * `UserConfirmedLive`.
 */
export const makeAppLayer = (
  options: {
    readonly external?: Layer.Layer<Layer.Success<typeof ExternalServicesLive>, unknown>
    readonly webDistDir?: string
    readonly routes?: Layer.Layer<never, never, HttpRouter.HttpRouter | AppServiceTypes>
    readonly userConfirmed?: Layer.Layer<never, unknown, BaseServiceTypes>
  } = {},
) =>
  Layer.mergeAll(AppRoutes, options.routes ?? Layer.empty).pipe(
    Layer.provide(makeAppServices(options.userConfirmed ?? UserConfirmedLive)),
    Layer.provide(options.external ?? ExternalServicesLive),
    Layer.provideMerge(AppConfig.layer({ webDistDir: options.webDistDir ?? "../web/dist" })),
  )
