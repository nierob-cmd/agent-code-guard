# Changelog

## 1.0.0

- Initial release.
- `block` and `requireApproval` modes for `edit`, `write`, `apply_patch`,
  and `exec` tool calls.
- Configurable `agentIds`, `delegateTo`, `blockedExtensionsDirect`,
  `blockedExtensionsExec`, and `exceptedPaths`.
- Detects direct file targets, heredoc/inline-interpreter writes, `cp`/`mv`,
  and `cat ... >` redirects inside `exec` commands.
