// Detect write-intent inside a shell command string and extract candidate
// target paths. This is deliberately layered: a command is first split into
// unwrapped shell-wrapper layers (shell-parser.js), then every layer is
// scanned independently by each detector below; results are unioned.

const PATH_TOKEN_RE = /[^\s'";<>|]+\.([a-zA-Z0-9]+)\b/g;

/** `> file`, `>> file`, `1> file`, `2>> file` (not `2>&1`) */
const REDIRECT_RE = /(?:^|\s)(?:\d\s*)?>{1,2}\s*([^\s|&;]+)/g;

/** cp/mv/install/dd/touch — file-creating or file-copying operations. */
const FILE_OP_RE = /(?:^|[;&|]\s*)(?:sudo\s+)?(cp|mv|install|touch|dd)\s+([^\n]*)/g;

/** `tee file` and `tee -a file` (append). */
const TEE_RE = /\btee\b(\s+-a\b)?\s+([^\s|&;]+)/g;

/** In-place editors: `sed -i file`, `sed --in-place file`, `perl -i ... file`. */
const IN_PLACE_RE = /\b(sed|perl)\b[^;&|\n]*\s(?:-i\S*|--in-place\S*)[^;&|\n]*?([^\s|&;]+\.[a-zA-Z0-9]+)\b/g;

/**
 * Inline interpreter write primitives: python's `open(x, "w")`/`.write(`,
 * node/bun/deno's `fs.writeFileSync`/`writeFile`, ruby's `File.write`/
 * `File.open(x, "w")`, perl's `open(FH, ">file")`, php's `file_put_contents`.
 * These only matter when the command also invokes one of the interpreters
 * (checked by the caller via INTERPRETER_INVOCATION_RE) - the regexes here
 * just find the write call + a following path-looking token.
 */
const INTERPRETER_INVOCATION_RE = /\b(python3?|node|bun|deno|ruby|perl|php)\b/;

const INLINE_WRITE_CALL_RE =
  /(?:open\([^)]*?,\s*['"]a?w[b+]?['"]|\.write\(|writeFileSync\(|writeFile\(|File\.write\(|file_put_contents\()/;

function extractPathTokensFrom(text) {
  PATH_TOKEN_RE.lastIndex = 0;
  const tokens = [];
  let m;
  while ((m = PATH_TOKEN_RE.exec(text)) !== null) {
    tokens.push(m[0].replace(/^['"]|['"]$/g, ""));
  }
  return tokens;
}

/**
 * Scan one unwrapped command layer for write-intent and return every
 * candidate target path found (regardless of extension - extension
 * filtering happens later in the policy layer, against resolved paths).
 */
export function extractWriteTargets(layer) {
  const targets = new Set();

  REDIRECT_RE.lastIndex = 0;
  let m;
  while ((m = REDIRECT_RE.exec(layer)) !== null) {
    targets.add(m[1].replace(/^['"]|['"]$/g, ""));
  }

  FILE_OP_RE.lastIndex = 0;
  while ((m = FILE_OP_RE.exec(layer)) !== null) {
    for (const token of extractPathTokensFrom(m[2])) targets.add(token);
    // cp/mv/install/touch/dd targets may lack a recognizable extension
    // (e.g. `cp app.py app`), so also capture bare trailing whitespace-
    // separated args as candidates.
    const args = m[2].trim().split(/\s+/).filter((a) => a && !a.startsWith("-"));
    for (const a of args) targets.add(a.replace(/^['"]|['"]$/g, ""));
  }

  TEE_RE.lastIndex = 0;
  while ((m = TEE_RE.exec(layer)) !== null) {
    targets.add(m[2].replace(/^['"]|['"]$/g, ""));
  }

  IN_PLACE_RE.lastIndex = 0;
  while ((m = IN_PLACE_RE.exec(layer)) !== null) {
    targets.add(m[2]);
  }

  if (INTERPRETER_INVOCATION_RE.test(layer) && INLINE_WRITE_CALL_RE.test(layer)) {
    for (const token of extractPathTokensFrom(layer)) targets.add(token);
  }

  return Array.from(targets).filter(Boolean);
}

export function hasWriteIntent(layer) {
  return extractWriteTargets(layer).length > 0;
}
