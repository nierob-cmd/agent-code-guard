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
directly, through a heredoc, through `cp`/`mv`, or through a `cat ... >`
redirect — it stops the call and tells the agent (and, optionally, you) to
delegate instead.

Two modes:

- **`block`** (default) — silent, instant denial. No popup, no five-minute
  timeout, no decision left hanging for a human. The agent just gets told
  "no, delegate" and moves on.
- **`requireApproval`** — the polite version, if you'd rather review each
  attempt yourself before denying it (or occasionally allowing it).

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
  diagnostics. No telemetry, no phoning home.

## License

MIT
