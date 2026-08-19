// Lexical path helpers. These operate on strings only; they never touch the
// filesystem (see fs-resolve.js for the symlink-aware resolution step).
import path from "node:path";

export function toPosixSlashes(rawPath) {
  return rawPath.replace(/\\/g, "/");
}

export function extensionOf(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return undefined;
  const normalized = toPosixSlashes(rawPath);
  const base = normalized.split("/").pop() || "";
  const match = /\.([a-zA-Z0-9]+)$/.exec(base);
  return match ? match[1].toLowerCase() : undefined;
}

export function basenameOf(rawPath) {
  const normalized = toPosixSlashes(rawPath);
  return normalized.split("/").pop() || "";
}

/**
 * Lexically normalize a path (collapse `.`/`..`/duplicate slashes) without
 * touching the filesystem. `..` segments are resolved against `cwd` when the
 * input is relative so that `../../etc/passwd`-style traversal is visible
 * before any symlink resolution happens.
 */
export function lexicalNormalize(rawPath, cwd) {
  const posixPath = toPosixSlashes(rawPath);
  const base = cwd ? toPosixSlashes(cwd) : "/";
  const absolute = path.posix.isAbsolute(posixPath)
    ? posixPath
    : path.posix.join(base, posixPath);
  return path.posix.normalize(absolute);
}
