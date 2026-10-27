# Frontend formatting and linting

Install dependencies with `bun install --frozen-lockfile` at the repository root. Use Node.js 24 or later; the vendored lint plugin uses native TypeScript loading. Bun is the package manager and script runner.

From `apps/web/`, run:

| Command | Purpose |
| --- | --- |
| `bun run format` | Apply Oxfmt formatting and Tailwind class sorting |
| `bun run format:check` | Check formatting without writing files |
| `bun run lint` | Run Oxlint and anti-slop; warnings also fail |
| `bun run typecheck` | Run TypeScript without emitting files |
| `bun run test:tooling` | Prove the configured rules and exclusions with temporary fixtures |
| `bun run size` | Build the app and fail if its JavaScript is over 300 kB gzipped (`tools/check-bundle-size.mjs`) |
| `bun run check` | Run all web checks, including the web tests and `size` |
| `bun run build` | Build the app into `apps/web/dist` with Vite |

The root `bun run check` runs every package's `check` (so the bundle-size budget runs in CI and precommit), and `bun run precommit` adds formatting and the build. CI runs both `bun run check` and `bun run build`.

## Bundle size

The shared client and everything else the browser loads must stay within a gzipped JavaScript budget. `tools/check-bundle-size.mjs` sums the gzipped size of `dist/assets/*.js`. The budget sits about 10% above the 275 kB the app weighed when it was set; when a change legitimately needs more, raise `defaultBudget` in the same change and say why.

## Policy

[Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) keeps the existing no-semicolon, double-quote, 100-column style. Its config is `apps/web/.oxfmtrc.json`. Tailwind sorting reads `apps/web/css/app.css`, including the Heroicons plugin (from the `heroicons` package). Keep `tailwindcss` and `@tailwindcss/vite` on the same version. Import sorting is disabled. The small adapters in `apps/web/tools/tailwind/` expose the default exports of the existing bundled daisyUI plugins to both Tailwind and Oxfmt. Plugin logging is disabled so formatting through standard input produces only source code.

[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) uses correctness checks, React hooks checks, accessibility checks, and the generic anti-slop rules. `apps/web/.oxlintrc.json` is the policy source. Nested ternaries are errors. Cyclomatic complexity is limited to 20 per function using Oxlint's built-in `complexity` rule. Simplify decisions or give a coherent part of the rendering its own function when a limit is exceeded.

Two choices reflect the application:

- Anti-slop permits `typeof` inside explicit type guards. Browser storage and other external data still require runtime validation.
- `jsx-a11y/prefer-tag-over-role` is disabled. Loading regions and live messages use `role="status"` on existing landmarks and containers. Replacing those with `output` can change the document structure and content model. Other accessibility checks remain enabled.

Both tools exclude the vendor assets and the vendored anti-slop source. The server and domain packages have their own Oxfmt and Oxlint configs (correctness rules plus no-nested-ternary and complexity, without anti-slop).

## Updating anti-slop

The source in `apps/web/tools/oxlint/anti-slop/` was copied with the upstream install skill from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `e8c4880471b23ab7f216fba7b27d173a6ef07d4c`. Its MIT license is included. The parent `apps/web/tools/oxlint/package.json` marks the plugin as an ES module without changing the module format of the vendor scripts.

Keep `oxlint` and `@oxlint/plugins` pinned to the same exact version. Review upstream source changes before replacing the local copy, preserve the license, and run `bun run check`. Effect-specific source is included by upstream's installer, but its plugin is not enabled: the web app doesn't use Effect directly, and the server packages don't use anti-slop.

Anti-slop's rules use syntax and local scope analysis. They do not replace `tsc`. Its JavaScript plugin host is still an experimental part of Oxlint, so validate both plugins and configuration when upgrading.
