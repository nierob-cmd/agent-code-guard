// Configuration schema, defaults, and normalization. Preserves every v1.x
// field and its default behavior; new fields are additive only.

const DEFAULT_BLOCKED_EXT_DIRECT = ["py", "js", "ts", "jsx", "tsx", "json", "sh"];
const DEFAULT_BLOCKED_EXT_EXEC = ["py", "js", "ts", "jsx", "tsx", "sh"];

function toStringArray(value, fallback) {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value;
  }
  return fallback;
}

function normalizeExtensionList(list) {
  return list.map((ext) => String(ext).replace(/^\./, "").toLowerCase());
}

function normalizeMode(value) {
  // "audit" is new in v2: it must detect and log violations without ever
  // blocking or prompting for approval.
  if (value === "requireApproval" || value === "audit") return value;
  return "block";
}

/**
 * @param {unknown} rawConfig
 */
export function normalizeConfig(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  return {
    agentIds: toStringArray(cfg.agentIds, []),
    delegateTo: toStringArray(cfg.delegateTo, []),
    blockedExtensionsDirect: normalizeExtensionList(
      toStringArray(cfg.blockedExtensionsDirect, DEFAULT_BLOCKED_EXT_DIRECT),
    ),
    blockedExtensionsExec: normalizeExtensionList(
      toStringArray(cfg.blockedExtensionsExec, DEFAULT_BLOCKED_EXT_EXEC),
    ),
    exceptedPaths: toStringArray(cfg.exceptedPaths, []),
    // New in v2: hard blocklist, checked against every resolved path form
    // with no exception override. Additive; empty by default so v1.x
    // configs behave identically until an operator opts in.
    blockedPaths: toStringArray(cfg.blockedPaths, []),
    mode: normalizeMode(cfg.mode),
    approvalTimeoutMs: typeof cfg.approvalTimeoutMs === "number" ? cfg.approvalTimeoutMs : 300000,
    approvalTimeoutBehavior: cfg.approvalTimeoutBehavior === "allow" ? "allow" : "deny",
  };
}
