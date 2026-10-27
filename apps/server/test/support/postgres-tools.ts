import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"

/**
 * Postgres client tools (pg_dump, psql) from a throwaway postgres:17 container, so the host
 * needs nothing installed and the tools match the server's major version.
 */
const runTool = (args: ReadonlyArray<string>, input?: string) =>
  Effect.callback<string, Error>((resume) => {
    const child = execFile(
      "docker",
      ["run", "--rm", "-i", "--network", "host", "postgres:17", ...args],
      { maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) =>
        resume(error ? Effect.fail(new Error(`${args[0]} failed: ${stderr}`)) : Effect.succeed(stdout)),
    )
    child.stdin?.end(input ?? "")
  }).pipe(Effect.orDie)

export const schemaFixturePath = fileURLToPath(new URL("../fixtures/schema.sql", import.meta.url))

export const readFixture = (name: string) =>
  Effect.promise(() => readFile(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8"))

/** `pg_dump --schema-only` of a database, leaving out the Effect migrator's own table. */
export const dumpSchema = (url: string) =>
  runTool([
    "pg_dump",
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--exclude-table=petitionu_migrations",
    url,
  ])

/** Drops the parts of a dump that vary between runs: the restrict key and version banners. */
export const normalizeDump = (dump: string) =>
  dump
    .split("\n")
    .filter((line) => !/^\\(un)?restrict /.test(line) && !line.startsWith("-- Dumped "))
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim()

/** Runs a SQL script with psql, stopping at the first error. */
export const runPsql = (url: string, script: string) =>
  runTool(["psql", "--quiet", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", url], script)
