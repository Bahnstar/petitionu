import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { gzipSync } from "node:zlib"

const script = new URL("../tools/check-bundle-size.mjs", import.meta.url).pathname

/** A built app holding `files` under `assets/`. */
const dist = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "bundle-size-"))
  mkdirSync(join(dir, "assets"))
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, "assets", name), contents)
  }
  return dir
}

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" })

// Random bytes don't compress, so each file's gzipped size is a little over its length.
const scripts = { "index-a.js": randomBytes(3000), "chunk-b.js": randomBytes(2000) }
const gzipped = Object.values(scripts).reduce((sum, bytes) => sum + gzipSync(bytes).length, 0)

test("passes when the gzipped JavaScript fits the budget, ignoring other assets", () => {
  const dir = dist({ ...scripts, "index.css": randomBytes(50_000) })
  const result = run(dir, String(gzipped))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, new RegExp(`${(gzipped / 1000).toFixed(1)} kB`))
})

test("fails when the gzipped JavaScript goes over the budget", () => {
  const result = run(dist(scripts), String(gzipped - 1))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /over the .* budget/)
})

test("fails when the build has no JavaScript", () => {
  const result = run(dist({ "index.css": "body {}" }), "1000")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /no JavaScript/)
})
