---
name: phoenix-elixir
description: "Use when changing Phoenix routes, HEEx, LiveViews, Ecto integration, or Elixir/OTP processes in Petitionu."
metadata:
  managed-by: usage-rules
---

<!-- usage-rules-skill-start -->
## Additional References

### phoenix

- [phoenix](references/phoenix/phoenix.md)
- [html](references/phoenix/html.md)
- [liveview](references/phoenix/liveview.md)
- [ecto](references/phoenix/ecto.md)

### usage_rules

- [usage_rules](references/usage_rules/usage_rules.md)
- [elixir](references/usage_rules/elixir.md)
- [otp](references/usage_rules/otp.md)

## Searching Documentation

```sh
mix usage_rules.search_docs "search term" -p phoenix -p usage_rules
```

## Available Mix Tasks

- `mix compile.phoenix`
- `mix phx` - Prints Phoenix help information
- `mix phx.digest` - Digests and compresses static files
- `mix phx.digest.clean` - Removes old versions of static assets.
- `mix phx.gen` - Lists all available Phoenix generators
- `mix phx.gen.auth` - Generates authentication logic for a resource
- `mix phx.gen.auth.hashing_library`
- `mix phx.gen.auth.injector`
- `mix phx.gen.auth.migration`
- `mix phx.gen.cert` - Generates a self-signed certificate for HTTPS testing
- `mix phx.gen.channel` - Generates a Phoenix channel
- `mix phx.gen.context` - Generates a context with functions around an Ecto schema
- `mix phx.gen.embedded` - Generates an embedded Ecto schema file
- `mix phx.gen.html` - Generates context and controller for an HTML resource
- `mix phx.gen.json` - Generates context and controller for a JSON resource
- `mix phx.gen.live` - Generates LiveView, templates, and context for a resource
- `mix phx.gen.notifier` - Generates a notifier that delivers emails by default
- `mix phx.gen.presence` - Generates a Presence tracker
- `mix phx.gen.release` - Generates release files and optional Dockerfile for release-based deployments
- `mix phx.gen.schema` - Generates an Ecto schema and migration file
- `mix phx.gen.secret` - Generates a secret
- `mix phx.gen.socket` - Generates a Phoenix socket handler
- `mix phx.routes` - Prints all routes
- `mix phx.server` - Starts applications and their servers
- `mix usage_rules.docs` - Shows documentation for Elixir modules and functions
- `mix usage_rules.install` - Installs usage_rules
- `mix usage_rules.install.docs`
- `mix usage_rules.list` - Lists usage-rules.md and sub-rules (usage-rules/*.md) for dependencies
- `mix usage_rules.search_docs` - Searches hexdocs with human-readable output
- `mix usage_rules.sync` - Sync AGENTS.md and agent skills from project config
- `mix usage_rules.sync.docs`
<!-- usage-rules-skill-end -->
