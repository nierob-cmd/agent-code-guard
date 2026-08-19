// Extension-based blocking, symlink-aware.
import { extensionOf } from "./path-utils.js";
import { isExceptedPath, isExplicitlyBlockedPath } from "./exceptions.js";
import { resolveRealPath } from "./fs-resolve.js";

/**
 * Check a list of candidate paths against a specific extension list
 * (direct-tool list or exec list, passed in by the caller), symlink-aware,
 * honoring exceptedPaths against the resolved path only.
 *
 * @returns {string|undefined} the first raw candidate path that is blocked
 */
export function findBlockedPath(paths, blockedExts, cfg, cwd) {
  for (const rawPath of paths) {
    if (isExplicitlyBlockedPath(rawPath, cfg.blockedPaths, cwd)) {
      return rawPath;
    }
    if (isExceptedPath(rawPath, cfg.exceptedPaths, cwd)) continue;
    const resolved = resolveRealPath(rawPath, cwd);
    const ext = extensionOf(resolved) || extensionOf(rawPath);
    if (ext && blockedExts.includes(ext)) {
      return rawPath;
    }
  }
  return undefined;
}
