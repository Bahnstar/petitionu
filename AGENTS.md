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

Read the relevant package rules before changing that integration; load only the files needed for the task. Paths below refer to installed dependencies under `deps/`.

| Task | Rules |
| --- | --- |
| Ash resources, actions, policies, queries | `deps/ash/usage-rules.md`; focused topics in `deps/ash/usage-rules/` |
| Database changes | `deps/ash_postgres/usage-rules.md` |
| Authentication | `deps/ash_authentication/usage-rules.md` |
| Ash forms in Phoenix | `deps/ash_phoenix/usage-rules.md` |
| TypeScript RPC contracts | `deps/ash_typescript/usage-rules.md` |
| JSON API | `deps/ash_json_api/usage-rules.md` |
| Phoenix routes, HEEx, LiveView, Ecto | Relevant file in `deps/phoenix/usage-rules/`: `phoenix.md`, `html.md`, `liveview.md`, or `ecto.md` |
| Elixir or OTP patterns | `deps/usage_rules/usage-rules/elixir.md` or `otp.md` in that directory |
| Igniter generators | `deps/igniter/usage-rules.md` |

For API details, use `mix usage_rules.docs Module.function/arity`. For documentation searches, use `mix usage_rules.search_docs "query" -p package`. If dependencies are unavailable, consult documentation matching the versions in `mix.lock`.

## Maintaining this file

Keep this guide limited to project conventions and pointers that affect implementation. Keep framework tutorials and generated usage-rule bodies in their source files; when updating package guidance, preserve references instead of inlining it here.
