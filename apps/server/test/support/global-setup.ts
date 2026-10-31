import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

/** Starts the dedicated test Postgres unless `TEST_DATABASE_URL` points elsewhere. */
export default function setup() {
  if (process.env.TEST_DATABASE_URL !== undefined) return
  execFileSync(fileURLToPath(new URL("../../../../scripts/test-db.sh", import.meta.url)), {
    stdio: "inherit",
  })
}
