---
name: ash-typescript
description: "Use when changing typescript_rpc declarations, generated TypeScript clients, browser RPC calls, or AshTypescript configuration in Petitionu."
metadata:
  managed-by: usage-rules
---

<!-- usage-rules-skill-start -->
## Additional References

### ash_typescript

- [ash_typescript](references/ash_typescript/ash_typescript.md)

## Searching Documentation

```sh
mix usage_rules.search_docs "search term" -p ash_typescript
```

## Available Mix Tasks

- `mix ash_typescript.codegen` - Generates TypeScript types for Ash Rpc-calls
- `mix ash_typescript.install` - Installs AshTypescript into a project. Should be called with `mix igniter.install ash_typescript`
- `mix ash_typescript.npm_install`
<!-- usage-rules-skill-end -->
