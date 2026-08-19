// Shell-wrapper detection and unwrapping. `sh -c '...'` (and bash/zsh/dash/
// ash variants) run an arbitrary sub-command inside a string argument; if we
// only scan the outer command literally, `sh -c "echo x > app.py"` sails
// through undetected. This recursively pulls out every nested `-c` payload
// so write-intent scanning below can see the real work being done.

const SHELL_WRAPPER_RE = /\b(?:sudo\s+)?(sh|bash|zsh|dash|ash)\s+(?:-\S+\s+)*-c\s+/;

/**
 * Find the `-c` payload argument in `command`, honoring simple quoting.
 * Returns undefined if no shell-wrapper pattern is present.
 */
function extractDashCPayload(command) {
  const match = SHELL_WRAPPER_RE.exec(command);
  if (!match) return undefined;
  const afterFlag = command.slice(match.index + match[0].length);
  const rest = afterFlag.trimStart();
  if (rest.length === 0) return undefined;

  const quoteChar = rest[0] === "'" || rest[0] === '"' ? rest[0] : undefined;
  if (!quoteChar) {
    // Unquoted -c payload: take the rest of the string, it's the simplest
    // safe interpretation (can't tell where a bare word-arg would end).
    return rest;
  }

  let i = 1;
  let escaped = false;
  let buf = "";
  for (; i < rest.length; i++) {
    const ch = rest[i];
    if (escaped) {
      buf += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quoteChar === '"') {
      escaped = true;
      continue;
    }
    if (ch === quoteChar) {
      return buf;
    }
    buf += ch;
  }
  // Unterminated quote: treat the remainder as the payload rather than
  // dropping it silently - fail closed, don't fail open.
  return buf;
}

/**
 * Recursively unwrap nested shell wrappers, returning every layer
 * (outermost first) so callers can scan the union of all of them. Bounded
 * to guard against pathological/cyclic input.
 */
export function unwrapShellLayers(command, maxDepth = 8) {
  const layers = [command];
  let current = command;
  for (let depth = 0; depth < maxDepth; depth++) {
    const payload = extractDashCPayload(current);
    if (payload === undefined || payload === current) break;
    layers.push(payload);
    current = payload;
  }
  return layers;
}

export function containsShellWrapper(command) {
  return SHELL_WRAPPER_RE.test(command);
}
