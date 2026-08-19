// Policy orchestration: ties together tool-target extraction, shell-wrapper
// unwrapping, write-intent detection, and path resolution to decide whether
// a given tool call should be blocked/approved/audited.
import { candidatePathsForEditWrite, candidatePathsForApplyPatch, commandStringOf } from "./tool-targets.js";
import { unwrapShellLayers } from "./shell-parser.js";
import { extractWriteTargets } from "./write-intent.js";
import { findBlockedPath } from "./extension-guard.js";
import { buildDecision } from "./decision.js";

function getCwd(ctx) {
  return ctx && typeof ctx.cwd === "string" ? ctx.cwd : process.cwd();
}

/**
 * @param {ReturnType<import('./config.js').normalizeConfig>} cfg
 * @param {{toolName:string, params?:Record<string,unknown>, derivedPaths?:string[]}} event
 * @param {{agentId?:string, cwd?:string}} ctx
 * @param {(entry:object)=>void} [logAudit] called for every hit while in
 *   `audit` mode, so the caller can log it (buildDecision itself returns
 *   undefined for audit mode and never blocks).
 */
export function evaluateGuard(cfg, event, ctx, logAudit) {
  if (cfg.agentIds.length > 0 && !cfg.agentIds.includes(ctx.agentId)) {
    return undefined;
  }

  const toolName = event.toolName;
  const params = event.params || {};
  const cwd = getCwd(ctx);

  const report = (target, ruleLabel) => {
    if (cfg.mode === "audit" && typeof logAudit === "function") {
      logAudit({ toolName, target, ruleLabel, agentId: ctx.agentId });
    }
    return buildDecision(cfg, toolName, target, ruleLabel);
  };

  if (toolName === "edit" || toolName === "write") {
    const paths = candidatePathsForEditWrite(params);
    if (paths.length === 0) {
      return report("(unknown path)", "A");
    }
    const hit = findBlockedPath(paths, cfg.blockedExtensionsDirect, cfg, cwd);
    if (hit) return report(hit, "A");
    return undefined;
  }

  if (toolName === "apply_patch") {
    const paths = candidatePathsForApplyPatch(event);
    if (paths.length === 0) {
      return report("(unknown patch path)", "A");
    }
    const hit = findBlockedPath(paths, cfg.blockedExtensionsDirect, cfg, cwd);
    if (hit) return report(hit, "A");
    return undefined;
  }

  if (toolName === "exec") {
    const command = commandStringOf(params);
    if (!command) return undefined;

    const layers = unwrapShellLayers(command);

    // Rule B: heredoc/inline-interpreter write primitives across any
    // unwrapped layer, checked against the direct-tool extension list
    // (writing code via an interpreter is equivalent to `write`).
    for (const layer of layers) {
      const targets = extractWriteTargets(layer);
      if (targets.length === 0) continue;
      const hit = findBlockedPath(targets, cfg.blockedExtensionsDirect, cfg, cwd);
      if (hit) return report(hit, "B");
    }

    // Rule C: file-copy/move/tee/in-place-editor style exec write attempts,
    // checked against the (typically narrower) exec extension list.
    for (const layer of layers) {
      const targets = extractWriteTargets(layer);
      if (targets.length === 0) continue;
      const hit = findBlockedPath(targets, cfg.blockedExtensionsExec, cfg, cwd);
      if (hit) return report(hit, "C");
    }

    return undefined;
  }

  return undefined;
}
