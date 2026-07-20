// agent-code-guard: stop specific agents from touching code/config directly,
// nudge them to delegate to named coding agents instead. Plain JS, no SDK
// import required - the loader only checks that `register` is a function.

const DEFAULT_BLOCKED_EXT_DIRECT = ["py", "js", "ts", "jsx", "tsx", "json", "sh"];
const DEFAULT_BLOCKED_EXT_EXEC = ["py", "js", "ts", "jsx", "tsx", "sh"];

function toStringArray(value, fallback) {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value;
  }
  return fallback;
}

function normalizeConfig(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  return {
    agentIds: toStringArray(cfg.agentIds, []),
    delegateTo: toStringArray(cfg.delegateTo, []),
    blockedExtensionsDirect: toStringArray(cfg.blockedExtensionsDirect, DEFAULT_BLOCKED_EXT_DIRECT),
    blockedExtensionsExec: toStringArray(cfg.blockedExtensionsExec, DEFAULT_BLOCKED_EXT_EXEC),
    exceptedPaths: toStringArray(cfg.exceptedPaths, []),
    mode: cfg.mode === "requireApproval" ? "requireApproval" : "block",
    approvalTimeoutMs: typeof cfg.approvalTimeoutMs === "number" ? cfg.approvalTimeoutMs : 300000,
    approvalTimeoutBehavior: cfg.approvalTimeoutBehavior === "allow" ? "allow" : "deny",
  };
}

function isExceptedPath(rawPath, exceptedPaths) {
  if (!rawPath || typeof rawPath !== "string") return false;
  const normalized = rawPath.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() || "";
  return exceptedPaths.some((pattern) => {
    try {
      return new RegExp(pattern).test(normalized) || new RegExp(pattern).test(basename);
    } catch {
      return false;
    }
  });
}

function extensionOf(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return undefined;
  const normalized = rawPath.replace(/\\/g, "/");
  const match = /\.([a-zA-Z0-9]+)$/.exec(normalized);
  return match ? match[1].toLowerCase() : undefined;
}

function pathsMatchBlockedExtension(paths, blockedExts, exceptedPaths) {
  for (const p of paths) {
    if (isExceptedPath(p, exceptedPaths)) continue;
    const ext = extensionOf(p);
    if (ext && blockedExts.includes(ext)) {
      return p;
    }
  }
  return undefined;
}

function candidatePathsForEditWrite(params) {
  const paths = [];
  const fp = params && (params.file_path ?? params.path);
  if (typeof fp === "string" && fp.trim()) paths.push(fp.trim());
  return paths;
}

function candidatePathsForApplyPatch(event) {
  const paths = [];
  if (Array.isArray(event.derivedPaths)) {
    for (const p of event.derivedPaths) {
      if (typeof p === "string" && p.trim()) paths.push(p.trim());
    }
  }
  const params = event.params || {};
  const fp = params.file_path ?? params.path;
  if (typeof fp === "string" && fp.trim()) paths.push(fp.trim());
  return paths;
}

function commandStringOf(params) {
  if (!params) return "";
  const raw = params.command ?? params.cmd ?? params.script;
  return typeof raw === "string" ? raw : "";
}

const HEREDOC_OR_INLINE_INTERPRETER_RE = /<<[-~]?\s*['"]?\w+|python3?\s+-c\b|\bnode\s+-e\b/;
const WRITE_OPERATION_RE = /open\([^)]*,\s*['"]a?w['"]|\.write\(|writeFileSync|>>?(?!>)|\btee\b/;
const PATH_TOKEN_RE = /[^\s'"<>|]+\.([a-zA-Z0-9]+)\b/g;

function findBlockedExtensionTokenInCommand(command, blockedExts, exceptedPaths) {
  PATH_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = PATH_TOKEN_RE.exec(command)) !== null) {
    const token = m[0];
    const ext = m[1].toLowerCase();
    if (blockedExts.includes(ext) && !isExceptedPath(token, exceptedPaths)) {
      return token;
    }
  }
  return undefined;
}

const CP_MV_RE = /(^|[;&|]\s*)(sudo\s+)?(cp|mv)\s+/;
const CAT_REDIRECT_RE = /(^|[;&|]\s*)(sudo\s+)?cat\s+\S+.*?>{1,2}\s*\S+/;

function evaluateExecForRuleB(command, blockedExts, exceptedPaths) {
  if (!HEREDOC_OR_INLINE_INTERPRETER_RE.test(command)) return undefined;
  if (!WRITE_OPERATION_RE.test(command)) return undefined;
  return findBlockedExtensionTokenInCommand(command, blockedExts, exceptedPaths);
}

function evaluateExecForRuleC(command, blockedExts, exceptedPaths) {
  if (!CP_MV_RE.test(command) && !CAT_REDIRECT_RE.test(command)) return undefined;
  return findBlockedExtensionTokenInCommand(command, blockedExts, exceptedPaths);
}

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

function buildDecision(cfg, toolName, target, ruleLabel) {
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

function evaluateGuard(cfg, event, ctx) {
  if (cfg.agentIds.length > 0 && !cfg.agentIds.includes(ctx.agentId)) {
    return undefined;
  }

  const toolName = event.toolName;
  const params = event.params || {};

  if (toolName === "edit" || toolName === "write") {
    const paths = candidatePathsForEditWrite(params);
    if (paths.length === 0) {
      return buildDecision(cfg, toolName, "(unknown path)", "A");
    }
    const hit = pathsMatchBlockedExtension(paths, cfg.blockedExtensionsDirect, cfg.exceptedPaths);
    if (hit) {
      return buildDecision(cfg, toolName, hit, "A");
    }
    return undefined;
  }

  if (toolName === "apply_patch") {
    const paths = candidatePathsForApplyPatch(event);
    if (paths.length === 0) {
      return buildDecision(cfg, toolName, "(unknown patch path)", "A");
    }
    const hit = pathsMatchBlockedExtension(paths, cfg.blockedExtensionsDirect, cfg.exceptedPaths);
    if (hit) {
      return buildDecision(cfg, toolName, hit, "A");
    }
    return undefined;
  }

  if (toolName === "exec") {
    const command = commandStringOf(params);
    if (!command) return undefined;

    const ruleBHit = evaluateExecForRuleB(command, cfg.blockedExtensionsDirect, cfg.exceptedPaths);
    if (ruleBHit) {
      return buildDecision(cfg, toolName, ruleBHit, "B");
    }

    const ruleCHit = evaluateExecForRuleC(command, cfg.blockedExtensionsExec, cfg.exceptedPaths);
    if (ruleCHit) {
      return buildDecision(cfg, toolName, ruleCHit, "C");
    }

    return undefined;
  }

  return undefined;
}

function pluginConfigSchema() {
  return {
    safeParse(value) {
      if (value === undefined) return { success: true, data: undefined };
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { success: false, error: { message: "expected config object" } };
      }
      return { success: true, data: value };
    },
  };
}

const agentCodeGuardPlugin = {
  id: "agent-code-guard",
  name: "agent-code-guard",
  description:
    "Blocks named agents from directly writing/editing code or config, pushing them to delegate instead.",
  configSchema: pluginConfigSchema(),
  register(api) {
    api.registerTrustedToolPolicy({
      id: "agent-code-guard-policy",
      description:
        "Configured agents must delegate code/config changes to named coding agents instead of touching them directly.",
      evaluate(event, ctx) {
        const cfg = normalizeConfig(api.pluginConfig);
        return evaluateGuard(cfg, event, ctx);
      },
    });
  },
};

export default agentCodeGuardPlugin;
