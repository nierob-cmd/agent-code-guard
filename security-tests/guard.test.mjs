import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeConfig } from "../src/config.js";
import { evaluateGuard } from "../src/policy.js";

function ctx(agentId = "protected-agent", cwd) {
  return { agentId, cwd };
}

function baseCfg(overrides = {}) {
  return normalizeConfig({ agentIds: ["protected-agent"], ...overrides });
}

function isBlocked(decision) {
  return Boolean(decision && (decision.block || decision.requireApproval));
}

// --- setup: a real temp dir so symlink resolution has something to walk ---
let tmpDir;
test.before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acg-test-"));
  fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "src", "app.ts"), "// real file\n");
  // The classic bypass: STATUS.md is a symlink pointing at protected src/app.ts
  fs.symlinkSync(path.join(tmpDir, "src", "app.ts"), path.join(tmpDir, "STATUS.md"));
});
test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("1. direct write to blocked extension is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: "app.py" } }, ctx());
  assert.ok(isBlocked(decision));
});

test("2. direct edit to blocked extension is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(cfg, { toolName: "edit", params: { file_path: "main.js" } }, ctx());
  assert.ok(isBlocked(decision));
});

test("3. apply_patch against blocked extension is blocked (via derivedPaths)", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "apply_patch", params: {}, derivedPaths: ["lib/util.ts"] },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("4. exec redirect write (echo > file.py) is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "echo 'x=1' > config.py" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("5. exec append redirect (>>) is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "echo 'x=1' >> config.py" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("6. exec cp of blocked extension is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "cp /tmp/malicious.py app.py" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("7. exec mv into blocked extension target is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "mv draft.txt server.js" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("8. exec install writing blocked extension is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "install -m 644 payload.sh /usr/local/bin/run.sh" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("9. exec tee into blocked extension is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "echo payload | tee backend/app.py" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("10. sed -i in-place edit of blocked extension is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "sed -i 's/foo/bar/' src/app.ts" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("11. perl -i in-place edit of blocked extension is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "perl -i -pe 's/a/b/' src/app.ts" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("12. inline python write (open(...,'w').write) is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    {
      toolName: "exec",
      params: { command: `python3 -c "open('app.py','w').write('evil=1')"` },
    },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("13. inline node write (fs.writeFileSync) is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    {
      toolName: "exec",
      params: { command: `node -e "require('fs').writeFileSync('server.js','evil')"` },
    },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("14. shell wrapper unwrap: bash -c \"echo x > app.py\" is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: `bash -c "echo x > app.py"` } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("14b. nested shell wrapper unwrap: sh -c \"bash -c 'echo x > app.py'\" is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: `sh -c "bash -c 'echo x > app.py'"` } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("15. symlink bypass: writing STATUS.md that resolves to src/app.ts (excepted path) is still blocked", () => {
  const cfg = baseCfg({ exceptedPaths: ["STATUS\\.md$"], blockedExtensionsDirect: ["ts"] });
  const target = path.join(tmpDir, "STATUS.md");
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: target } }, ctx("protected-agent", tmpDir));
  assert.ok(isBlocked(decision), "resolved-real-path check must catch the symlink bypass");
});

test("16. legitimate exception (real, non-symlinked file) is allowed", () => {
  const cfg = baseCfg({ exceptedPaths: ["README\\.md$"] });
  const readme = path.join(tmpDir, "README.md");
  fs.writeFileSync(readme, "docs");
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: readme } }, ctx("protected-agent", tmpDir));
  assert.equal(decision, undefined);
});

test("17. non-code extension (e.g. .md without exception) is allowed", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: "notes.md" } }, ctx());
  assert.equal(decision, undefined);
});

test("18. agent not in agentIds is not evaluated at all", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: "app.py" } }, ctx("some-other-agent"));
  assert.equal(decision, undefined);
});

test("19. blockedPaths hard-blocks regardless of exceptedPaths override attempt", () => {
  const cfg = baseCfg({ blockedPaths: ["secrets\\.env$"], exceptedPaths: ["secrets\\.env$"] });
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: "secrets.env" } }, ctx());
  assert.ok(isBlocked(decision));
});

test("20. mode=requireApproval returns requireApproval shape, not block", () => {
  const cfg = baseCfg({ mode: "requireApproval" });
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: "app.py" } }, ctx());
  assert.ok(decision.requireApproval);
  assert.equal(decision.block, undefined);
});

test("21. mode=audit never blocks but invokes the audit callback", () => {
  const cfg = baseCfg({ mode: "audit" });
  let logged;
  const decision = evaluateGuard(
    cfg,
    { toolName: "write", params: { file_path: "app.py" } },
    ctx(),
    (entry) => (logged = entry),
  );
  assert.equal(decision, undefined);
  assert.ok(logged && logged.target === "app.py");
});

test("22. path traversal (../../etc bypass attempt against a blocked extension) is still evaluated on resolved path", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: "cp payload.py ../../tmp/escaped.py" } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("23. exec with no write intent at all is allowed", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(cfg, { toolName: "exec", params: { command: "ls -la src/" } }, ctx());
  assert.equal(decision, undefined);
});

test("24. deno inline write primitive is blocked", () => {
  const cfg = baseCfg();
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: `deno eval "Deno.writeFileSync('app.js', new Uint8Array())"` } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("25. ruby File.write inline primitive is blocked", () => {
  // rb/php aren't in the default blocked-extension lists (v1.x compat);
  // configure them explicitly to exercise the inline-write detector itself.
  const cfg = baseCfg({ blockedExtensionsDirect: ["rb"] });
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: `ruby -e "File.write('app.rb', 'x')"` } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("26. php file_put_contents inline primitive is blocked", () => {
  const cfg = baseCfg({ blockedExtensionsDirect: ["php"] });
  const decision = evaluateGuard(
    cfg,
    { toolName: "exec", params: { command: `php -r "file_put_contents('app.php','x');"` } },
    ctx(),
  );
  assert.ok(isBlocked(decision));
});

test("28. symlinked parent directory, target does not exist yet, is blocked", () => {
  // real/link -> real/src ; write real/link/new.ts, where new.ts has never
  // existed. The parent segment is the symlink, not the leaf - resolution
  // must walk up to the nearest existing ancestor (the symlinked dir),
  // resolve THAT, then rejoin the not-yet-created leaf.
  const cfg = baseCfg();
  const link = path.join(tmpDir, "real", "link");
  const src = path.join(tmpDir, "real", "src");
  fs.mkdirSync(src, { recursive: true });
  fs.symlinkSync(src, link);
  const target = path.join(link, "new.ts");
  assert.equal(fs.existsSync(target), false, "precondition: target must not exist yet");
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: target } }, ctx("protected-agent", tmpDir));
  assert.ok(isBlocked(decision), "write through a symlinked parent to a not-yet-existing file must still resolve to the real (protected) directory");
});

test("29. symlinked parent directory, target already exists, is blocked", () => {
  const cfg = baseCfg();
  const link = path.join(tmpDir, "real", "link");
  const src = path.join(tmpDir, "real", "src");
  // real/link already created by test 28; reuse it if present, else create.
  if (!fs.existsSync(link)) fs.symlinkSync(src, link);
  const existingTarget = path.join(link, "existing.ts");
  fs.writeFileSync(path.join(src, "existing.ts"), "// pre-existing\n");
  assert.equal(fs.existsSync(existingTarget), true, "precondition: target must already exist via the symlinked parent");
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: existingTarget } }, ctx("protected-agent", tmpDir));
  assert.ok(isBlocked(decision), "write through a symlinked parent to an already-existing file must resolve to the real (protected) directory");
});

test("30. audit mode returns exactly undefined (real trusted-tool-policy 'allow' contract), never a block/requireApproval/allow:false shape", () => {
  // Verified against the real host contract in
  // src/plugins/host-hooks.ts: PluginTrustedToolPolicyRegistration.evaluate
  // may return PluginHookBeforeToolCallResult | {allow?, reason?} | void.
  // `void`/`undefined` is the implicit-allow path - audit mode must use
  // exactly that, not an explicit {allow:true} or any block-shaped object,
  // since only `undefined` is guaranteed not to trigger any UI/approval
  // side effect regardless of host version.
  const cfg = baseCfg({ mode: "audit" });
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: "app.py" } }, ctx());
  assert.equal(decision, undefined);
});

test("27. v1.x config shape (no new fields) still normalizes and blocks as before", () => {
  const cfg = normalizeConfig({
    agentIds: ["protected-agent"],
    delegateTo: ["engineer"],
    blockedExtensionsDirect: ["py"],
    blockedExtensionsExec: ["py"],
    exceptedPaths: [],
    mode: "block",
    approvalTimeoutMs: 60000,
    approvalTimeoutBehavior: "deny",
  });
  assert.deepEqual(cfg.blockedPaths, []);
  const decision = evaluateGuard(cfg, { toolName: "write", params: { file_path: "app.py" } }, ctx());
  assert.ok(isBlocked(decision));
});
