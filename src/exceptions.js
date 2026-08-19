// Exception matching. This is the security-sensitive half of the
// symlink-bypass fix: an exception pattern is only honored against the
// filesystem-resolved real path, never against the raw/lexical path alone.
// Otherwise `ln -s src/app.ts STATUS.md; write STATUS.md` would match an
// `exceptedPaths: ["STATUS.md"]` entry while writing to `src/app.ts`.
import { basenameOf } from "./path-utils.js";
import { resolveRealPath } from "./fs-resolve.js";

function testPatterns(subject, patterns) {
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern).test(subject);
    } catch {
      return false;
    }
  });
}

/**
 * @param {string} rawPath
 * @param {string[]} exceptedPaths regex patterns, matched against the
 *   resolved real path and its basename (matching v1.x behavior, but on
 *   the resolved path instead of the raw one).
 * @param {string|undefined} cwd
 */
export function isExceptedPath(rawPath, exceptedPaths, cwd) {
  if (!rawPath || typeof rawPath !== "string") return false;
  if (!exceptedPaths || exceptedPaths.length === 0) return false;
  const resolved = resolveRealPath(rawPath, cwd);
  const resolvedBasename = basenameOf(resolved);
  return testPatterns(resolved, exceptedPaths) || testPatterns(resolvedBasename, exceptedPaths);
}

/**
 * Explicit hard blocklist (new in v2, additive to exceptedPaths): unlike
 * exceptions, these are checked against every candidate form so an alias
 * can't dodge a blocklist entry either. There is intentionally no override
 * for a blockedPaths hit - it is a hard fail-closed stop.
 */
export function isExplicitlyBlockedPath(rawPath, blockedPaths, cwd) {
  if (!blockedPaths || blockedPaths.length === 0) return false;
  const resolved = resolveRealPath(rawPath, cwd);
  const resolvedBasename = basenameOf(resolved);
  return (
    testPatterns(rawPath, blockedPaths) ||
    testPatterns(resolved, blockedPaths) ||
    testPatterns(resolvedBasename, blockedPaths)
  );
}
