import { Layer } from "effect"
import { AppConfig } from "./Config.ts"
import { DatabaseLive } from "./Database.ts"
import { HealthRoutes } from "./Health.ts"
import { MailerLive } from "./Mailer.ts"
import { RpcRoutes } from "./Rpc.ts"
import { SchoolRegistry } from "./SchoolRegistry.ts"
import { ShellRoutes, StaticRoutes } from "./Web.ts"

/**
 * Composition point for HTTP routes. Each feature area adds one line for its route layer.
 */
export const AppRoutes = Layer.mergeAll(
  HealthRoutes,
  RpcRoutes,
  ShellRoutes,
  StaticRoutes,
  // T05: AuthRoutes (Better Auth under /api/auth/*)
)

/**
 * Composition point for internal services shared by the routes (database, queue, auth, ...).
 * Each feature area adds one line for its service layer.
 */
export const AppServices = Layer.mergeAll(DatabaseLive)

/**
 * Services that reach outside the process and that tests replace with fakes
 * (Mailer, SchoolRegistry).
 */
export const ExternalServicesLive = Layer.mergeAll(MailerLive, SchoolRegistry.layer)

/**
 * The whole application as a router layer. `serve` runs it on Node; tests turn it into an
 * in-process web handler. Configuration comes from the ambient `ConfigProvider`.
 */
export const makeAppLayer = (
  options: {
    readonly external?: typeof ExternalServicesLive
    readonly webDistDir?: string
  } = {},
) =>
  AppRoutes.pipe(
    Layer.provide(AppServices),
    Layer.provide(options.external ?? ExternalServicesLive),
    Layer.provideMerge(AppConfig.layer({ webDistDir: options.webDistDir ?? "../web/dist" })),
  )
