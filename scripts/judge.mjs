import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReceiptLedger, safeRepoPath } from "../src/core.js";
import { checkSandbox, runSandboxed } from "../src/sandbox.js";
import { git, readWorktreeFile, repositoryBase } from "../src/worktrees.js";

const [, , cwd, command, ...args] = process.argv;
if (!cwd || command !== "node" || !args.length) {
  console.error("usage: node scripts/judge.mjs <git-worktree> node <args...>");
  process.exit(2);
}
checkSandbox();
const {root} = repositoryBase(cwd);
const files = git(root, ["ls-files", "-z"], {bytes: true}).toString("utf8").split("\0").filter(safeRepoPath);
if (files.length > 128) throw new Error("standalone judge supports at most 128 tracked paths");
const parent = mkdtempSync(join(tmpdir(), "warforge-judge-"));
try {
  const {stdout, stderr, ...outcome} = runSandboxed({
    parent, readFile: file => readWorktreeFile(root, file), files, args, timeout: 10_000
  });
  const ledger = new ReceiptLedger();
  const receipt = ledger.append({
    match_id: "standalone-judge", type: "TEST_RECEIPT", actor: "warforge://operator/test-harness",
    seat: null, payload: {kind: "test", ...outcome}
  });
  mkdirSync("runtime/receipts", {recursive: true, mode: 0o700});
  const path = `runtime/receipts/judge-${receipt.receipt_id}.json`;
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n", {flag: "wx", mode: 0o600});
  console.log(JSON.stringify({receipt: path, hash: receipt.receipt_hash, exit_code: outcome.exit_code}));
  process.exitCode = outcome.passed ? 0 : outcome.exit_code || 1;
} finally {
  rmSync(parent, {recursive: true, force: true});
}
