# agent-code-guard

Your orchestrator agent keeps "helpfully" editing code it was explicitly told
to delegate. You've written the rule in `AGENTS.md` three times, in bold, in
caps, with a "no exceptions" clause. It still does it anyway.

**agent-code-guard makes the rule physical instead of hopeful.**

No more waiting five minutes for an approval popup you were always going to
deny. No more agents finding a "clever" way to sneak a `write` call past a
politely-worded instruction. One config block, and the tool call just...
doesn't happen. Silently. Immediately. Every time.

Your agents stop *meddling* in code they were told to leave alone — and
start actually delegating to the coding agent you built for exactly that
job.

## What it does

`agent-code-guard` is an OpenClaw trusted-tool-policy plugin. For every
configured agent, it inspects `edit`, `write`, `apply_patch`, and `exec`
tool calls before they run. If the call touches a blocked file extension —
directly, through a heredoc, through `cp`/`mv`/`install`/`touch`/`dd`,
through `tee`, through an in-place editor (`sed -i`, `perl -i`), through an
inline interpreter write primitive (Python/Node/Bun/Deno/Ruby/Perl/PHP), or
through a `cat ... >` redirect — it stops the call and tells the agent (and,
optionally, you) to delegate instead.

Shell wrappers are unwrapped before scanning: `sh -c '...'`, `bash -c '...'`,
and `zsh -c '...'` (including nested combinations) are recursively unpacked
so a write hidden inside a wrapped sub-shell is caught the same way a bare
command would be.

Path checks are symlink-aware. An excepted path (`exceptedPaths`) is only
honored against the filesystem-resolved real path, not the raw string an
agent passes in — so `ln -s src/app.ts STATUS.md` followed by "write to the
excepted `STATUS.md`" does not bypass protection for `src/app.ts`. A new
`blockedPaths` list (regex, checked against every resolved path form) adds a
hard block that no exception can override, for files you never want touched
under any circumstance.

Three modes:

- **`block`** (default) — silent, instant denial. No popup, no five-minute
  timeout, no decision left hanging for a human. The agent just gets told
  "no, delegate" and moves on.
- **`requireApproval`** — the polite version, if you'd rather review each
  attempt yourself before denying it (or occasionally allowing it).
- **`audit`** (new in 2.0.0) — never blocks or prompts; logs every hit it
  would otherwise have acted on, at `warn` level, so you can see what the
  policy would do before switching a fleet over to `block`.

## Install

```bash
openclaw plugins install clawhub:nierob-cmd/agent-code-guard
```

## Configure

Nothing happens until you tell it which agent(s) to guard and which
extensions matter to you. Example — stop your `main`/orchestrator agent
from touching code, and point it at your coding agents:

```json5
{
  plugins: {
    allow: ["agent-code-guard"],
    entries: {
      "agent-code-guard": {
        enabled: true,
        config: {
          agentIds: ["main"],
          delegateTo: ["coder", "reviewer-agent"],
          blockedExtensionsDirect: ["py", "js", "ts", "jsx", "tsx", "json", "sh"],
          blockedExtensionsExec: ["py", "js", "ts", "jsx", "tsx", "sh"],
          exceptedPaths: ["STATUS\\.md$", "CHANGELOG\\.md$", "README\\.md$"],
          mode: "block",
        },
      },
    },
  },
}
```

- `agentIds` — required in practice. Empty array = the guard is loaded but
  does nothing. Add every agent id you want held to this rule.
- `delegateTo` — purely cosmetic but genuinely useful: names shown in the
  block message so the agent (and you, reading the logs) know exactly who
  should have gotten this task instead.
- `exceptedPaths` — regexes checked against both the full path and the
  basename. Use it for the files you *do* want the guarded agent to keep
  writing itself (status logs, its own changelog, whatever you decide is
  fine).
- `blockedExtensionsDirect` / `blockedExtensionsExec` — tune these per your
  stack. Add your own DSL extensions (`.tf`, `.dyn`, whatever your agents
  work with) if plain code extensions aren't the whole story for you.
- `blockedPaths` (new in 2.0.0, optional, default `[]`) — regex patterns
  checked against every resolved form of a candidate path (raw, lexically
  normalized, and symlink-resolved). Unlike `exceptedPaths`, nothing
  overrides a `blockedPaths` hit — use it for files that must never be
  touched by the guarded agent, full stop.

## Security hardening in 2.0.0

Version 1.x matched extensions against the path string an agent literally
passed to the tool call. That is enough to stop a cooperative agent from
accidentally editing `app.py`, but it does not survive deliberate evasion.
2.0.0 closes the gaps that mattered most:

- **Symlink/alias bypass** — an excepted path is now resolved via
  `fs.realpathSync` before the exception is checked. Pointing an excepted
  filename at a protected file no longer works.
- **Shell-wrapper evasion** — `sh -c`/`bash -c`/`zsh -c` payloads (including
  nested wrappers) are unpacked and scanned like top-level commands.
- **Broader exec write-intent coverage** — redirects (`>`, `>>`), `cp`/`mv`/
  `install`/`touch`/`dd`, `tee`, in-place editors (`sed -i`, `perl -i`), and
  inline interpreter write calls (`open(...,'w')`, `writeFileSync`,
  `File.write`, `file_put_contents`, etc.) across Python, Node, Bun, Deno,
  Ruby, Perl, and PHP.
- **Path traversal** — candidate paths are lexically normalized (`..`
  collapsed against a best-effort working directory) before extension
  matching, so a `../../` escape does not silently dodge the check.

## Why `block` instead of an approval prompt

If the answer to "should this agent write code directly" is always going to
be "no" — and it is, that's the entire point of building an orchestrator +
delegate architecture — then an approval prompt is just latency with extra
steps. `block` mode gives the same outcome instantly, with zero operator
attention required, and (bonus) a five-minute stuck approval can no longer
stall the agent's next move.

Prefer a human in the loop for now? Set `mode: "requireApproval"` and get
the original behavior: a titled, described approval card with a configurable
timeout and timeout fallback.

## What it does *not* do

- It does not evaluate whether code is *good* — it only decides whether the
  guarded agent is allowed to touch it at all. Pair it with a real reviewer
  agent on the delegate side.
- It does not stop other agents from touching those extensions — it is
  scoped per `agentIds`, on purpose. Guard only the agents that should
  never be doing this themselves.
- It does not persist or log anywhere beyond your normal OpenClaw tool-call
  diagnostics (except `audit` mode's explicit warn-level log line). No
  telemetry, no phoning home.
- **It is not a sandbox and does not provide OS-level security.** It is a
  best-effort policy layer built on regex-based command parsing and
  filesystem path resolution at evaluation time — it reduces the odds of an
  agent accidentally or casually writing where it shouldn't, and raises the
  bar for deliberate evasion, but it cannot guarantee containment against an
  adversarial model actively trying to escape it (e.g. via a shell syntax
  form the parser doesn't recognize, a TOCTOU race between evaluation and
  execution, or a tool/capability entirely outside `edit`/`write`/
  `apply_patch`/`exec`). If you need a hard security boundary, enforce it at
  the OS/container/filesystem-permission level in addition to this plugin,
  not instead of it.

## License

MIT
