// Second, self-directed adversarial pass: exercises bypass attempts that
// are NOT part of guard.test.mjs's assertion set, specifically to probe for
// gaps the primary suite might share blind spots with. Run standalone:
// `node security-tests/run-selftest.mjs`. Exits non-zero on any bypass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeConfig } from "../src/config.js";
import { evaluateGuard } from "../src/policy.js";

const ctxFor = (cwd) => ({ agentId: "protected-agent", cwd });
const cfg = normalizeConfig({ agentIds: ["protected-agent"] });

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acg-selftest-"));
fs.mkdirSync(path.join(tmpDir, "src"));
fs.writeFileSync(path.join(tmpDir, "src", "app.ts"), "// real\n");
fs.symlinkSync(path.join(tmpDir, "src", "app.ts"), path.join(tmpDir, "alias.md"));

const cases = [
  { name: "double-nested shell wrapper", tool: "exec", command: `sh -c "sh -c \\"bash -c 'echo x > app.py'\\""` },
  { name: "semicolon-chained redirect after benign command", tool: "exec", command: "ls; echo x > app.py" },
  { name: "cat heredoc into blocked file", tool: "exec", command: "cat > app.py << 'EOF'\nevil\nEOF" },
  { name: "sudo-prefixed cp", tool: "exec", command: "sudo cp payload.py app.py" },
  { name: "uppercase extension", tool: "write", params: { file_path: "app.PY" } },
  { name: "trailing whitespace path", tool: "write", params: { file_path: "app.py " } },
  { name: "python3 -c inline write with double quotes inside single", tool: "exec", command: `python3 -c 'open("app.py","w").write("x")'` },
  { name: "symlink alias resolving to protected .ts, no exception configured", tool: "write", params: { file_path: path.join(tmpDir, "alias.md") }, cwd: tmpDir },
  { name: "relative traversal through symlinked dir cwd", tool: "exec", command: "mv draft.txt ../src/app.ts", cwd: path.join(tmpDir, "src") },
  { name: "double-nested bash -c bash -c redirect", tool: "exec", command: `bash -c "bash -c 'echo x > app.ts'"` },
  { name: "sh -c wrapping bash -c (double-quoted inner)", tool: "exec", command: `sh -c 'bash -c "echo x > app.ts"'` },
  { name: "zsh -c wrapping sh -c tee", tool: "exec", command: `zsh -c 'sh -c "tee app.ts"'` },
  { name: "dir/../src/app.ts traversal via cp", tool: "exec", command: "cp payload.py dir/../src/app.ts" },
  { name: "dir//src//app.ts double-slash via cp", tool: "exec", command: "cp payload.py dir//src//app.ts" },
  { name: "./src/./app.ts dot-segments via cp", tool: "exec", command: "cp payload.py ./src/./app.ts" },
  { name: "sudo bash -c redirect", tool: "exec", command: `sudo bash -c "echo x > app.ts"` },
  { name: "sudo sh -c python3 -c inline write", tool: "exec", command: `sudo sh -c "python3 -c 'open(\\"app.ts\\",\\"w\\").write(1)'"` },
  { name: "command chaining with && before redirect", tool: "exec", command: "echo ok && echo x > app.ts" },
  { name: "command chaining with ; before redirect", tool: "exec", command: "echo ok ; echo x > app.ts" },
  { name: "pipe into tee", tool: "exec", command: "echo x | tee app.ts" },
];

let failures = 0;
for (const c of cases) {
  const event = c.tool === "write"
    ? { toolName: "write", params: c.params }
    : { toolName: "exec", params: { command: c.command } };
  const decision = evaluateGuard(cfg, event, ctxFor(c.cwd));
  const blocked = Boolean(decision && (decision.block || decision.requireApproval));
  const status = blocked ? "BLOCKED" : "ALLOWED";
  console.log(`[selftest] ${status.padEnd(8)} ${c.name}`);
  if (!blocked) failures++;
}

fs.rmSync(tmpDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} adversarial case(s) were NOT blocked.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} adversarial self-test cases were blocked.`);
