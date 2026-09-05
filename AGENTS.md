# Petitionu agent guide

## Working conventions

- Before implementation or diagnosing an unexpected error, read the usage rules for the packages involved (see below). Keep that research scoped to the task.
- Before using a Mix task, read `mix help <task>`. Available tasks and aliases are discoverable through `mix help` and `mix.exs`.
- Use `Req` for server-side HTTP requests.
- Run focused checks for the changed behavior, then `mix precommit` before finishing. Report any blockers and distinguish existing failures from regressions.
- For frontend changes, also check TypeScript with `cd assets && ./node_modules/.bin/tsc --noEmit` and build with `mix assets.build`; `mix precommit` does not check TypeScript or bundle assets.

## Repo-specific boundaries

- The application UI uses React in `assets/js`, shared primitives in `assets/components/ui`, and Ash resources in `lib/petitionu`. Follow the existing frontend and resource patterns when extending a feature.
- Authentication uses AshAuthentication. For auth or route changes, inspect `lib/petitionu_web/router.ex` and `lib/petitionu_web/live_user_auth.ex`; the user assign is `current_user`. The optional `current_scope` attribute in `Layouts.app` is not the authentication contract.
- `assets/js/ash_rpc.ts` is generated. Change the Ash resources/domain RPC declarations, then run `mix ash_typescript.codegen`. Preserve CSRF headers on browser RPC calls using `buildCSRFHeaders()`.
- Reuse existing UI components. Use Lucide in React and `<.icon>` in HEEx; use `<.input>` for HEEx form fields. Build new styling with Tailwind and custom CSS, without adding daisyUI components or CSS `@apply`.
- Preserve Tailwind's import/source declarations in `assets/css/app.css`. Bundle JavaScript through the entry points configured in `config/config.exs`; put behavior in asset modules instead of inline template scripts.
- For application LiveViews, wrap content in `<Layouts.app flash={@flash}>` and keep `<.flash_group>` inside `layouts.ex`. Consult the LiveView rules below when adding forms, streams, hooks, or tests.

## Documentation on demand

Read the relevant skill before changing that integration, then load only the reference files needed for the task. These skills are generated from the installed dependencies.

| Task | Guidance |
| --- | --- |
| Ash resources, policies, authentication, migrations, JSON API, Ash forms | [.agents/skills/ash-resources/SKILL.md](.agents/skills/ash-resources/SKILL.md) |
| TypeScript RPC declarations, clients, configuration | [.agents/skills/ash-typescript/SKILL.md](.agents/skills/ash-typescript/SKILL.md) |
| Phoenix routes, HEEx, LiveView, Ecto, Elixir/OTP | [.agents/skills/phoenix-elixir/SKILL.md](.agents/skills/phoenix-elixir/SKILL.md) |
| Igniter generators | `deps/igniter/usage-rules.md` |

For API details, use `mix usage_rules.docs Module.function/arity`. For documentation searches, use `mix usage_rules.search_docs "query" -p package`. If dependencies are unavailable, consult documentation matching the versions in `mix.lock`.

## Maintaining this file

Keep this guide limited to project conventions and pointers. Skill selection and descriptions live in `mix.exs` under `usage_rules/0`; update that configuration instead of editing generated skills or references. After dependency or guidance changes, run `mix usage_rules.sync`, review the generated diff, and verify with `mix usage_rules.sync --check`. The skills-only configuration intentionally leaves this file untouched.
