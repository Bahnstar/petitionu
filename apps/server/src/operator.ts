/**
 * `operator` entry point: one-off admin commands, run from the same image as the server.
 * Prints what it changed and exits 0; prints why it refused and exits non-zero.
 *
 * Usage: `node apps/server/dist/operator.js <command>`; see `--help` and docs/deployment.md.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Role } from "@petitionu/domain"
import { Cause, Console, Effect, Layer } from "effect"
import { Argument, CliError, Command, Flag } from "effect/cli"
import { AppConfig } from "./Config.ts"
import { DatabaseLive } from "./Database.ts"
import {
  approveOrganization,
  OperatorError,
  retryVerification,
  setRole,
} from "./OperatorCommands.ts"
import { SchoolVerificationQueue } from "./SchoolVerification.ts"

const Database = DatabaseLive.pipe(
  Layer.provide(AppConfig.layer({ webDistDir: "", publicHostUnused: true })),
)

const print = (lines: ReadonlyArray<string>) => Effect.forEach(lines, (line) => Console.log(line))

const user = Argument.String("user").pipe(Argument.withDescription("The user's email or id"))

const approve = Command.make(
  "approve-organization",
  {
    organization: Argument.String("organization").pipe(
      Argument.withDescription("The organization's domain or id"),
    ),
  },
  ({ organization }) =>
    approveOrganization(organization).pipe(Effect.flatMap(print), Effect.provide(Database)),
).pipe(
  Command.withDescription(
    "Approve an organization without a registry match and activate its waiting users",
  ),
)

const role = Command.make(
  "set-role",
  {
    user,
    role: Argument.Literals("role", Role.literals).pipe(Argument.withDescription("The new role")),
    create: Flag.Boolean("create").pipe(
      Flag.withDescription("Create the account, on a system with no users yet"),
      Flag.withDefault(false),
    ),
  },
  ({ user, role, create }) =>
    setRole({ target: user, role, create }).pipe(
      Effect.flatMap(print),
      Effect.provide(Database),
    ),
).pipe(Command.withDescription("Set a user's role, without needing an existing superadmin"))

const retry = Command.make("retry-verification", { user }, ({ user }) =>
  retryVerification(user).pipe(
    Effect.flatMap(print),
    Effect.provide(SchoolVerificationQueue.layer),
    Effect.provide(Database),
  ),
).pipe(Command.withDescription("Queue a new school-verification job for a user whose job failed"))

/** Prints why the command failed; the CLI has already printed its own usage errors. */
const reportFailure = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause)
  if (CliError.isCliError(error)) return Effect.void
  return Console.error(error instanceof OperatorError ? error.message : Cause.pretty(cause))
}

Command.make("operator").pipe(
  Command.withDescription("PetitionU operator commands"),
  Command.withSubcommands([approve, role, retry]),
  Command.run({ version: "1.0.0" }),
  Effect.tapCause(reportFailure),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
)
