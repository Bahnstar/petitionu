#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export MIX_ENV=prod
mix help deps.get >/dev/null
mix deps.get --only prod
npm ci --prefix assets
mix help compile >/dev/null
mix compile --warnings-as-errors
mix help assets.setup >/dev/null
mix assets.setup
mix help assets.deploy >/dev/null
mix assets.deploy
mix help release >/dev/null
mix release --overwrite
tar -czf _build/prod/petitionu-release.tar.gz -C _build/prod/rel petitionu
