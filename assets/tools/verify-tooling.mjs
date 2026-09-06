import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const assets = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const fixture = mkdtempSync(join(tmpdir(), "petitionu-tooling-"))

function run(tool, args) {
  const result = spawnSync(join(assets, "node_modules", ".bin", tool), args, {
    cwd: fixture,
    encoding: "utf8",
  })
  assert.ifError(result.error)
  return { status: result.status, output: result.stdout + result.stderr }
}

try {
  const lintConfig = JSON.parse(readFileSync(join(assets, ".oxlintrc.json"), "utf8"))
  lintConfig.jsPlugins = lintConfig.jsPlugins.map((plugin) => ({
    ...plugin,
    specifier: resolve(assets, plugin.specifier),
  }))
  writeFileSync(join(fixture, ".oxlintrc.json"), JSON.stringify(lintConfig))
  const formatConfig = JSON.parse(readFileSync(join(assets, ".oxfmtrc.json"), "utf8"))
  formatConfig.sortTailwindcss.stylesheet = resolve(assets, formatConfig.sortTailwindcss.stylesheet)
  writeFileSync(join(fixture, ".oxfmtrc.json"), JSON.stringify(formatConfig))

  const excluded = [
    "js/ash_rpc.ts",
    "js/ash_types.ts",
    "vendor/example.js",
    "tools/oxlint/anti-slop/example.ts",
  ]
  for (const path of excluded) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true })
    writeFileSync(join(fixture, path), "generated content: leave this untouched")
  }

  writeFileSync(
    join(fixture, "valid.tsx"),
    `
export const styled = <div className="text-red-500 p-4 flex" />
export function isString(value: unknown): value is string {
  return typeof value === "string"
}
export function label(loading: boolean, empty: boolean) {
  if (loading) return "Loading"
  if (empty) return "Empty"
  return "Ready"
}
`,
  )
  const valid = run("oxlint", ["--deny-warnings", "."])
  assert.equal(valid.status, 0, valid.output)

  writeFileSync(
    join(fixture, "invalid.tsx"),
    `
export const nested = (a: boolean, b: boolean) => a ? b ? <p>One</p> : <p>Two</p> : null
export const unsafe = {} as unknown as { id: string }
export function complex(value: number) {
  let count = 0
  ${Array.from({ length: 20 }, (_, index) => `if (value === ${index}) count++`).join("\n  ")}
  return count
}
`,
  )
  const invalid = run("oxlint", ["--deny-warnings", "."])
  assert.equal(invalid.status, 1, invalid.output)
  for (const rule of [
    "no-nested-ternary",
    "complexity",
    "no-chained-type-assertions",
    "require-safety-comment-for-type-assertion",
  ]) {
    assert.ok(invalid.output.includes(rule), `Missing ${rule}: ${invalid.output}`)
  }

  const unformatted = run("oxfmt", ["--check", "."])
  assert.equal(unformatted.status, 1, unformatted.output)
  const formatted = run("oxfmt", ["."])
  assert.equal(formatted.status, 0, formatted.output)
  assert.ok(
    readFileSync(join(fixture, "valid.tsx"), "utf8").includes('className="flex p-4 text-red-500"'),
    "Tailwind classes must actually be sorted",
  )
  const checked = run("oxfmt", ["--check", "."])
  assert.equal(checked.status, 0, checked.output)
  for (const path of excluded) {
    assert.equal(
      readFileSync(join(fixture, path), "utf8"),
      "generated content: leave this untouched",
    )
  }
  console.log("Tooling checks passed: lint rules, formatting, and generated-file exclusions.")
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
