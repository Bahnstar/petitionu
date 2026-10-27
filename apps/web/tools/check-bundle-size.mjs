// Fails when the built web app's JavaScript, gzipped, goes over its budget.
// Usage: node tools/check-bundle-size.mjs [distDir] [budgetBytes]
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

/** About 10% above the 275 kB the app weighed when the budget was set. Raise it deliberately. */
const defaultBudget = 300_000

const [distDir = new URL("../dist", import.meta.url).pathname, budgetArg] = process.argv.slice(2)
const budget = budgetArg === undefined ? defaultBudget : Number(budgetArg)
const assets = join(distDir, "assets")
const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`

const scripts = readdirSync(assets).filter((name) => name.endsWith(".js"))
if (scripts.length === 0) {
  console.error(`Bundle size: no JavaScript in ${assets}; build the app first.`)
  process.exit(1)
}
const total = scripts.reduce(
  (sum, name) => sum + gzipSync(readFileSync(join(assets, name))).length,
  0,
)
if (total > budget) {
  console.error(`Bundle size: ${kB(total)} gzipped is over the ${kB(budget)} budget.`)
  process.exit(1)
}
console.log(`Bundle size: ${kB(total)} gzipped, within the ${kB(budget)} budget.`)
