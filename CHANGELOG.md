# Changelog

## 2.0.0 — Security hardening

- **Symlink-aware path resolution**: `exceptedPaths` is now checked against
  the filesystem-resolved real path (`fs.realpathSync`, walking up to the
  nearest existing ancestor for not-yet-created write targets), closing an
  alias/symlink bypass (e.g. `ln -s src/app.ts STATUS.md`).
- **New `blockedPaths` config field**: a hard-block regex list checked
  against every resolved path form, with no exception override.
- **New `audit` mode**: logs would-be blocks at `warn` level without ever
  blocking or prompting.
- **Shell-wrapper unwrapping**: `sh -c`/`bash -c`/`zsh -c` (including nested
  combinations) are recursively unpacked before write-intent scanning.
- **Expanded exec write-intent detection**: `install`, `touch`, `dd`, `tee`,
  in-place editors (`sed -i`, `perl -i`), and inline interpreter write
  primitives across Python, Node, Bun, Deno, Ruby, Perl, and PHP (previously
  only Python/Node heredoc-style detection existed).
- **Path traversal handling**: candidate paths are lexically normalized
  (`..` collapsed) before extension matching.
- **Rewritten as a modular implementation** (`src/config.js`,
  `src/path-utils.js`, `src/fs-resolve.js`, `src/exceptions.js`,
  `src/extension-guard.js`, `src/tool-targets.js`, `src/shell-parser.js`,
  `src/write-intent.js`, `src/policy.js`, `src/decision.js`) instead of a
  single-file implementation, to make each concern independently testable.
- **100% backward compatible** with 1.x config: `agentIds`, `delegateTo`,
  `blockedExtensionsDirect`, `blockedExtensionsExec`, `exceptedPaths`,
  `mode` (`block`/`requireApproval`), `approvalTimeoutMs`, and
  `approvalTimeoutBehavior` all behave identically when no new fields are
  set.
- See `RELEASE_NOTES.md` for the full security audit writeup and evidence.

## 1.0.1

- Docs fix: install command in README used a literal `<owner>` placeholder
  instead of the real publisher handle.

## 1.0.0

- Initial release.
- `block` and `requireApproval` modes for `edit`, `write`, `apply_patch`,
  and `exec` tool calls.
- Configurable `agentIds`, `delegateTo`, `blockedExtensionsDirect`,
  `blockedExtensionsExec`, and `exceptedPaths`.
- Detects direct file targets, heredoc/inline-interpreter writes, `cp`/`mv`,
  and `cat ... >` redirects inside `exec` commands.
