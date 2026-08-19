// Symlink-aware path resolution. A lexically-normalized path is not enough:
// an agent can create (or already have) a symlink such as
// `STATUS.md -> src/app.ts` and then "write to STATUS.md", which a
// string-only exception match against `STATUS.md` would happily allow while
// the actual bytes land in `src/app.ts`. To defeat that, we resolve as much
// of the path as actually exists on disk via fs.realpathSync, then rejoin
// the not-yet-created tail (relevant for `write` creating a new file).
import fs from "node:fs";
import path from "node:path";
import { lexicalNormalize } from "./path-utils.js";

/**
 * Resolve `rawPath` to its real, symlink-free absolute path as far as the
 * filesystem allows. Any path segments that don't exist yet (e.g. a file
 * about to be created) are preserved lexically on top of the real prefix of
 * whichever nearest ancestor does exist.
 *
 * Never throws: filesystem errors (permission, ELOOP, etc.) fall back to the
 * lexical path, since a resolution failure must never be treated as "safe".
 */
export function resolveRealPath(rawPath, cwd) {
  const lexical = lexicalNormalize(rawPath, cwd);
  const segments = lexical.split("/").filter(Boolean);

  let existingPrefix = "/";
  let tailIndex = 0;
  for (let i = segments.length; i >= 0; i--) {
    const candidate = "/" + segments.slice(0, i).join("/");
    try {
      const real = fs.realpathSync(candidate);
      existingPrefix = real.replace(/\\/g, "/");
      tailIndex = i;
      break;
    } catch {
      continue;
    }
  }

  const tail = segments.slice(tailIndex);
  if (tail.length === 0) return existingPrefix;
  return path.posix.join(existingPrefix, ...tail);
}

/**
 * All path forms worth checking against exceptions/blocklists: the raw
 * input, the lexical normalization, and the symlink-resolved real path.
 * Callers should treat this as an unordered set - a match on ANY form
 * against a blocklist is a block, but a match on ONLY the raw/lexical form
 * (not the resolved one) against an *exception* must not be trusted, since
 * that is exactly the bypass this module exists to close.
 */
export function candidateFormsOf(rawPath, cwd) {
  const lexical = lexicalNormalize(rawPath, cwd);
  const resolved = resolveRealPath(rawPath, cwd);
  const forms = new Set([rawPath, lexical, resolved]);
  return Array.from(forms);
}
