# MVP dependency security review

The September 5, 2026 review addressed the 45 advisories reported by `mix deps.get` against the previous lockfile. All 45 have published fixes. The upgraded lockfile contains none of their explicitly listed affected versions.

| Package | Previous | Required fixed version | Locked version | Advisories | Primary advisory |
| --- | --- | --- | --- | --- | --- |
| Ash | 3.32.0 | 3.33.0 | 3.33.0 | 17 | [String length bounds](https://cna.erlef.org/cves/CVE-2026-82752.html) |
| AshAdmin | 0.13.26 | 1.3.1 | 1.3.2 | 7 | [Client input atom creation](https://cna.erlef.org/cves/CVE-2026-82722.html) |
| AshAuthentication | 4.14.1 | 4.14.2 | 4.14.2 | 2 | [Purpose-limited bearer tokens](https://cna.erlef.org/cves/CVE-2026-65633.html) |
| AshPhoenix | 2.3.24 | 2.3.25 | 2.3.25 | 4 | [Subdomain tenant authorization](https://cna.erlef.org/cves/CVE-2026-82724.html) |
| AshPostgres | 2.12.0 | 2.13.0 | 2.13.0 | 1 | [Failed tenant rename](https://cna.erlef.org/cves/CVE-2026-78699.html) |
| AshSql | 0.7.0 | 0.7.1 | 0.7.2 | 5 | [Aggregate tenant prefix](https://cna.erlef.org/cves/CVE-2026-81318.html) |
| AshTypescript | 0.17.3 | 0.18.0 | 0.18.2 | 7 | [Forbidden field value disclosure](https://cna.erlef.org/cves/CVE-2026-82730.html) |
| Mint | 1.9.3 | 1.10.0 | 1.10.0 | 2 | [Unbounded HTTP buffering](https://cna.erlef.org/cves/CVE-2026-82728.html) |

Ash 3.33 also requires `config :ash, default_string_length_count: :codepoints`. The alternative `:mixed` setting preserves the unbounded combining-character behavior and does not close that issue.

Ash 3.32.2 fixes sixteen of the Ash advisories. Version 3.33.0 is required for the string length advisory. AshAdmin has no fixed 0.x release. Its upgrade also requires Cinder 0.9 or later and Gettext 1.0. The resolver selected Cinder 0.17.0 and Gettext 1.0.2. [Gettext's changelog](https://github.com/elixir-gettext/gettext/blob/main/CHANGELOG.md#v100) reports no breaking changes from 0.26.

AshTypescript 0.18 requires `Petitionu.AshTypescriptManifest` and its `config :ash_typescript, manifest: ...` registration to discover RPC actions.

AshTypescript 0.18 rejects unsupported top-level filter, sort, and pagination options that older versions silently ignored. Its RPC errors use `type` instead of `code`. Regenerate the TypeScript contract when integrating this upgrade.

Run the recorded advisory check from the repository root:

```sh
python3 scripts/check-dependency-advisories.py
```

The script uses Python's standard library. It fetches the current primary EEF JSON records for the 45 IDs embedded in the script and compares `mix.lock` with each record's explicit affected-version list. An affected version or an unavailable record exits unsuccessfully. `--lockfile PATH` checks another lockfile.

This check covers those 45 advisories only. It does not discover new advisories or prove that dependencies have no other vulnerabilities. Run `mix deps.get --check-locked` to check the current Hex advisory feed and `cd assets && bun audit` for frontend dependencies. At review time, Hex reported no advisories for the upgraded set and `bun audit --json` returned `{}`.
