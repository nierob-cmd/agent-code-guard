// Turns a policy hit into the real OpenClaw trusted-tool-policy return
// contract: {block, blockReason} | {requireApproval:{...}} | undefined.
// `audit` mode always returns undefined (never blocks/prompts) but callers
// are expected to log the hit themselves before calling this.

function buildMessage(toolName, target, ruleLabel, delegateTo) {
  const delegateHint =
    delegateTo.length > 0
      ? `Delegate to: ${delegateTo.join(", ")}.`
      : "Delegate this to the appropriate coding agent.";
  return (
    `agent-code-guard: this agent tried to touch code/config directly ` +
    `(tool: ${toolName}, target: ${target}, rule: ${ruleLabel}) - ` +
    `this agent does not write or edit code itself. ${delegateHint}`
  );
}

export function buildDecision(cfg, toolName, target, ruleLabel) {
  if (cfg.mode === "audit") {
    return undefined;
  }

  const message = buildMessage(toolName, target, ruleLabel, cfg.delegateTo);

  if (cfg.mode === "requireApproval") {
    return {
      requireApproval: {
        title: "agent-code-guard: blocked direct code/config edit",
        description: message,
        severity: "warning",
        timeoutMs: cfg.approvalTimeoutMs,
        timeoutBehavior: cfg.approvalTimeoutBehavior,
      },
    };
  }

  return { block: true, blockReason: message };
}
