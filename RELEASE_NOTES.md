# Release notes — 2.0.0 "Security hardening"

## Why this release exists

1.0.x matched a blocked file extension against the literal path string an
agent passed to a tool call. That stops accidental/cooperative violations
but does nothing against an agent (or an injected instruction) deliberately
trying to route around the guard — e.g. writing through a symlinked alias
that happens to match an `exceptedPaths` entry, or hiding a write inside a
wrapped sub-shell. 2.0.0 is a from-scratch audit and rewrite of the
detection and path-resolution logic to close the gaps that matter most,
while keeping every 1.x config field working exactly as before.

## What changed

See `CHANGELOG.md` for the itemized list. In short: symlink-aware path
resolution, a new hard `blockedPaths` list, a new non-blocking `audit` mode,
recursive shell-wrapper unwrapping, and materially broader exec write-intent
detection (file ops, `tee`, in-place editors, and inline interpreter write
primitives across seven languages).

## Evidence

- `npm test` (28 adversarial + regression tests, `security-tests/guard.test.mjs`):
  **28/28 passing.**
- `npm run selftest` (`security-tests/run-selftest.mjs`, a second,
  independently-written adversarial pass targeting bypass shapes not already
  covered by the primary suite — nested-nested shell wrappers, semicolon
  chaining, heredocs, `sudo`-prefixed commands, case sensitivity, trailing
  whitespace, alternate quote nesting, and the symlink-alias bypass with no
  exception configured at all): **9/9 blocked**, 0 bypasses found.
- Both suites are deterministic and filesystem-based (real temp
  directories/symlinks via `fs.mkdtempSync`/`fs.symlinkSync`), not mocked —
  the symlink-bypass regression test creates an actual symlink on disk and
  confirms the resolved target, not the alias name, is what gets evaluated.

## Compatibility

Every 1.x config field (`agentIds`, `delegateTo`, `blockedExtensionsDirect`,
`blockedExtensionsExec`, `exceptedPaths`, `mode`, `approvalTimeoutMs`,
`approvalTimeoutBehavior`) is read and normalized identically to 1.0.1. An
existing 1.x config, dropped in unmodified, produces the same block/allow
decisions as before (test 27 in the suite asserts this directly with an
otherwise-untouched 1.x-shaped config object). The two new fields
(`blockedPaths`, `audit` mode) are opt-in and default to no-ops.

## Known limitations

This plugin is a policy layer, not a sandbox. It cannot promise containment
against an adversarial model actively trying to escape it — see the "What
it does not do" section of `README.md` for the full disclaimer. In
particular:

- Shell-command parsing is regex/heuristic-based, not a real shell grammar
  parser. Sufficiently unusual quoting, encoding, or command substitution
  forms may not be recognized.
- There is a theoretical time-of-check/time-of-use gap between path
  resolution at evaluation time and actual tool execution.
- Tools other than `edit`/`write`/`apply_patch`/`exec` are not covered.
- `exceptedPaths` and `blockedPaths` patterns are regexes supplied by the
  operator; a misconfigured pattern is the operator's responsibility, not
  something this plugin can detect for you.

## Files changed

- `index.js` — thin plugin entry point (was previously the entire
  implementation).
- `package.json` — version bump to `2.0.0`, added `main`/`scripts` fields.
- `src/config.js` — config normalization, now including `blockedPaths` and
  `audit` mode.
- `src/path-utils.js` — lexical path helpers (no filesystem access).
- `src/fs-resolve.js` — symlink-aware real-path resolution.
- `src/exceptions.js` — exception/blocklist matching against resolved paths.
- `src/extension-guard.js` — extension-based blocking over a candidate path
  list.
- `src/tool-targets.js` — path/command extraction from tool-call params.
- `src/shell-parser.js` — shell-wrapper (`sh`/`bash`/`zsh -c`) detection and
  recursive unwrapping.
- `src/write-intent.js` — write-intent detection and target extraction for
  `exec` commands.
- `src/policy.js` — orchestration: ties the above together per tool call.
- `src/decision.js` — builds the block/requireApproval/audit decision.
- `security-tests/guard.test.mjs` — primary test suite (28 tests).
- `security-tests/run-selftest.mjs` — independent adversarial self-test
  (9 additional bypass attempts).
- `README.md`, `CHANGELOG.md` — updated for 2.0.0.
