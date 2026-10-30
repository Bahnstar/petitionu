import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"

const entryPoint = fileURLToPath(new URL("../../src/operator.ts", import.meta.url))

export interface OperatorRun {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** Runs the `operator` entry point as its own process, as an operator does. */
export const runOperator = (
  database: { readonly url: string },
  ...args: ReadonlyArray<string>
): Effect.Effect<OperatorRun> =>
  Effect.callback((resume) => {
    execFile(
      process.execPath,
      [entryPoint, ...args],
      { env: { PATH: process.env.PATH, DATABASE_URL: database.url } },
      (error, stdout, stderr) =>
        resume(Effect.succeed({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr })),
    )
  })
