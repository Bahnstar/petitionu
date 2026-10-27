import { AppRpcs } from "@petitionu/domain"
import { Layer } from "effect"
import { RpcSerialization, RpcServer } from "effect/rpc"

/**
 * Composition point for RPC handlers. Each feature area adds one line for the handler layer
 * of the group it merged into `AppRpcs`.
 */
export const RpcHandlers = Layer.mergeAll(AppRpcs.toLayer({}))

/** `POST /rpc`: the RPC API over HTTP with JSON serialization. */
export const RpcRoutes = RpcServer.layerHttp({
  group: AppRpcs,
  path: "/rpc",
  protocol: "http",
}).pipe(Layer.provide([RpcHandlers, RpcSerialization.layerJson]))
