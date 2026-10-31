import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"

const entryPoint = fileURLToPath(new URL("../../src/operator.ts", import.meta.url))

/** Longer than any command takes, so that a command that hangs fails its test here. */
const killAfter = 15_000

export interface OperatorRun {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * Runs the `operator` entry point as its own process, as an operator does. `env` adds to its
 * environment. A process that couldn't start or had to be killed dies, so it never counts as a
 * non-zero exit.
 */
export const runOperator = (
  database: { readonly url: string; readonly env?: Record<string, string> },
  ...args: ReadonlyArray<string>
): Effect.Effect<OperatorRun> =>
  Effect.callback((resume) => {
    execFile(
      process.execPath,
      [entryPoint, ...args],
      {
        env: { PATH: process.env.PATH, DATABASE_URL: database.url, ...database.env },
        timeout: killAfter,
        // SIGTERM would let Effect interrupt the program and exit with an ordinary code.
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        if (error && (error.killed || typeof error.code !== "number")) {
          const reason = error.killed ? `was killed after ${killAfter} ms` : error.message
          resume(Effect.die(new Error(`operator ${args.join(" ")} ${reason}\n${stdout}${stderr}`)))
          return
        }
        resume(Effect.succeed({ code: error ? Number(error.code) : 0, stdout, stderr }))
      },
    )
  })

/** Runs the same kind of command `count` times at once and returns every result. */
export const runConcurrently = (
  count: number,
  run: (index: number) => Effect.Effect<OperatorRun>,
) =>
  Effect.all(
    Array.from({ length: count }, (_, index) => run(index)),
    { concurrency: "unbounded" },
  )
