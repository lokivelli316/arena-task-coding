import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = mkdtempSync(join(tmpdir(), "warforge-smoke-"));
const repo = join(root, "repository");
const output = join(root, "evidence");
const entry = fileURLToPath(new URL("./coder.mjs", import.meta.url));
const config = fileURLToPath(new URL("../examples/coding-deathmatch.json", import.meta.url));
const plan = fileURLToPath(new URL("../examples/coding-deathmatch-plan.json", import.meta.url));
const git = (...args) => execFileSync("/usr/bin/git", ["-C", repo, ...args]).toString().trim();
const coder = (...args) => JSON.parse(execFileSync(process.execPath, [entry, ...args], {encoding: "utf8"}));

try {
  execFileSync("/usr/bin/git", ["init", "-q", repo]);
  writeFileSync(join(repo, "answer.txt"), "baseline\n");
  git("add", "answer.txt");
  git("-c", "user.name=Warforge Smoke", "-c", "user.email=smoke@localhost", "commit", "-qm", "Smoke baseline");
  const base = git("rev-parse", "HEAD");
  const report = coder("run", config, repo, output, plan);
  const replay = coder("replay", report.evidence, report.tip);
  assert.deepEqual(report.result.winners, ["alpha"]);
  assert.deepEqual(replay.result, report.result);
  assert.equal(replay.artifacts, 3);
  assert.equal(git("rev-parse", "HEAD"), base);
  console.log(JSON.stringify({
    status: "PASS", address: report.address, winner: replay.result.winners[0],
    receipts: replay.receipts, verified_artifacts: replay.artifacts, tip: replay.tip,
    evidence: process.env.WARFORGE_SMOKE_KEEP === "1" ? report.evidence : undefined
  }, null, 2));
} finally {
  if (process.env.WARFORGE_SMOKE_KEEP !== "1") rmSync(root, {recursive: true, force: true});
}
