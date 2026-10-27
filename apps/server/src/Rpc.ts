import { AppRpcs } from "@petitionu/domain"
import { Layer } from "effect"
import { type Rpc, RpcGroup, RpcSerialization, RpcServer } from "effect/rpc"
import { AccountsHandlers } from "./Accounts.ts"
import { SupportHandlers } from "./Support.ts"
import { UsersHandlers } from "./Users.ts"
import { ActorMiddlewareLive, RequireUserLive, RpcRequestGuard } from "./Actor.ts"
import { PetitionsHandlers } from "./Petitions.ts"

/**
 * Composition point for RPC handlers. Each feature area adds one line for the handler layer
 * of the group it merged into `AppRpcs`.
 */
export const RpcHandlers = Layer.mergeAll(
  AccountsHandlers,
  UsersHandlers,
  SupportHandlers,
  PetitionsHandlers,
)

/**
 * Serves `group` at `POST path` with the app's guard (CSRF, current actor) and RPC middleware.
 * `RpcRoutes` uses it for `AppRpcs`; tests use it for test-only groups.
 */
export const rpcRoute = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  path: `/${string}`,
) =>
  RpcServer.layerHttp({ group, path, protocol: "http" }).pipe(
    Layer.provide([ActorMiddlewareLive, RequireUserLive, RpcSerialization.layerJson]),
    Layer.provide(RpcRequestGuard),
  )

/** `POST /rpc`: the RPC API over HTTP with JSON serialization. */
export const RpcRoutes = rpcRoute(AppRpcs, "/rpc").pipe(Layer.provide(RpcHandlers))
