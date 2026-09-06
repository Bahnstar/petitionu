# Frontend formatting and linting

Install dependencies with `cd assets && bun install --frozen-lockfile`. Use Node.js 22.18 or later; the vendored lint plugin uses native TypeScript loading. Bun remains the package manager and script runner.

From `assets/`, run:

| Command | Purpose |
| --- | --- |
| `bun run format` | Apply Oxfmt formatting and Tailwind class sorting |
| `bun run format:check` | Check formatting without writing files |
| `bun run lint` | Run Oxlint and anti-slop; warnings also fail |
| `bun run typecheck` | Run TypeScript without emitting files |
| `bun run test:tooling` | Prove the configured rules and exclusions with temporary fixtures |
| `bun run check` | Run all frontend checks |

`mix precommit` includes `bun run check`. The frontend GitHub Actions workflow runs the same checks and `mix assets.build`. Run `mix assets.build` locally after frontend changes as well.

## Policy

[Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) keeps the existing no-semicolon, double-quote, 100-column style. Its config is `assets/.oxfmtrc.json`. Tailwind sorting reads `assets/css/app.css`, including the Heroicons plugin, so install Elixir dependencies before formatting. The npm Tailwind package is pinned to the standalone CLI version in `config/config.exs`; update both together. Import sorting is disabled. The small adapters in `assets/tools/tailwind/` expose the default exports of the existing bundled daisyUI plugins to both Tailwind and Oxfmt. Plugin logging is disabled so formatting through standard input produces only source code.

[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) uses correctness checks, React hooks checks, accessibility checks, and the generic anti-slop rules. `assets/.oxlintrc.json` is the policy source. Nested ternaries are errors. Cyclomatic complexity is limited to 20 per function using Oxlint's built-in `complexity` rule. Simplify decisions or give a coherent part of the rendering its own function when a limit is exceeded.

Two choices reflect the application:

- Anti-slop permits `typeof` inside explicit type guards. Browser storage and other external data still require runtime validation.
- `jsx-a11y/prefer-tag-over-role` is disabled. Loading regions and live messages use `role="status"` on existing landmarks and containers. Replacing those with `output` can change the document structure and content model. Other accessibility checks remain enabled.

Both tools exclude generated `assets/js/ash_rpc.ts` and `assets/js/ash_types.ts`, existing vendor assets, and the vendored anti-slop source. TypeScript still checks the generated contracts. Formatting and linting are scoped to `assets/`; Mix continues to format Elixir and HEEx.

## Updating anti-slop

The source in `assets/tools/oxlint/anti-slop/` was copied with the upstream install skill from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `e8c4880471b23ab7f216fba7b27d173a6ef07d4c`. Its MIT license is included. The parent `assets/tools/oxlint/package.json` marks the plugin as an ES module without changing the module format of Phoenix's vendor scripts.

Keep `oxlint` and `@oxlint/plugins` pinned to the same exact version. Review upstream source changes before replacing the local copy, preserve the license, and run `bun run check`. Effect-specific source is included by upstream's installer, but its plugin is not enabled because this project does not use Effect.

Anti-slop's rules use syntax and local scope analysis. They do not replace `tsc`. Its JavaScript plugin host is still an experimental part of Oxlint, so validate both plugins and configuration when upgrading.
