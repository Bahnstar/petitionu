/**
 * `migrate` entry point: applies database migrations, then exits.
 * Reserved for the baseline migration ticket (T02), which implements it.
 */
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { ObservabilityLive } from "./Logging.ts"

Effect.fail(new Error("The migrate entry point is not implemented yet.")).pipe(
  Effect.provide(ObservabilityLive),
  NodeRuntime.runMain,
)
