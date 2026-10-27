/**
 * `serve` entry point: runs the HTTP server on Node.
 * Built to `dist/serve.js`; in development, Node runs this file directly.
 */
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { makeAppLayer } from "./App.ts"
import { AppConfig } from "./Config.ts"
import { ObservabilityLive } from "./Logging.ts"

// Both `src/serve.ts` and the bundled `dist/serve.js` sit two levels below `apps/`.
const webDistDir = fileURLToPath(new URL("../../web/dist", import.meta.url))

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const { port } = yield* AppConfig
    return HttpRouter.serve(makeAppLayer({ webDistDir })).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { port, host: "0.0.0.0" })),
    )
  }),
).pipe(Layer.provide(AppConfig.layer({ webDistDir })))

Layer.launch(ServerLive).pipe(Effect.provide(ObservabilityLive), NodeRuntime.runMain)
