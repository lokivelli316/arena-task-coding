import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { signAuthorityPacket } from "../src/authority.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import manifest from "../examples/coding-deathmatch.json" with {type: "json"};
import { CodingDeathmatch } from "../src/coding-match.js";
import { replayMatch, verifyArtifacts } from "../src/replay.js";
import { sha256 } from "../src/core.js";

function fixture(t, change = () => {}, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "warforge-test-"));
  const repo = join(root, "repo");
  let match;
  t.after(() => {
    try { match?.close(); }
    finally { rmSync(root, {recursive: true, force: true}); }
  });
  execFileSync("git", ["init", "--quiet", repo]);
  writeFileSync(join(repo, "answer.txt"), "baseline\n");
  writeFileSync(join(repo, "private.txt"), "base-private\n");
  writeFileSync(join(repo, ".gitignore"), "ignored.txt\n");
  symlinkSync("private.txt", join(repo, "link.txt"));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], {encoding: "utf8"}).trim();
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "base");
  const config = structuredClone(manifest);
  change(config);
  match = new CodingDeathmatch(config, {...options, repository: repo, output: join(root, "evidence")});
  const session = seat => match.openSeat(seat, config.seats.find(item => item.id === seat).operator);
  return {match, session, config, repo, git, base: git("rev-parse", "HEAD")};
}

function accept(response) {
  assert.equal(response.ok, true, JSON.stringify(response));
  return response.result;
}

test("two governed seats commit, receive deterministic verdicts, and replay the archived result", t => {
  const {match, session, repo, git, base} = fixture(t);
  const alpha = session("alpha");
  const bravo = session("bravo");
  const judge = session("judge");
  const initial = accept(alpha.invoke("context"));
  assert.equal(initial.base, base);
  assert.equal(initial.seat, "alpha");
  assert.equal(initial.task.title, "Implement the acceptance fixture");
  assert.equal(Object.hasOwn(initial, "worktree"), false);
  assert.equal(bravo.invoke("evaluate", {seat: "alpha"}).reason, "denied");
  assert.equal(alpha.invoke("write", {path: "../bravo/answer.txt", content: "intrusion"}).reason, "file-scope");
  accept(alpha.invoke("write", {path: "answer.txt", content: "warforge\n"}));
  assert.equal(accept(bravo.invoke("read", {path: "answer.txt"})).content, "baseline\n");
  assert.equal(accept(alpha.invoke("run", {id: "readiness"})).passed, true);
  assert.equal(alpha.invoke("run", {id: "readiness", args: ["changed"]}).reason, "invalid-input");
  const a = accept(alpha.invoke("submit"));
  accept(bravo.invoke("write", {path: "answer.txt", content: "incorrect\n"}));
  const b = accept(bravo.invoke("submit"));
  assert.notEqual(a.commit, b.commit);
  assert.equal(alpha.invoke("write", {path: "answer.txt", content: "late"}).reason, "seat-submitted");
  assert.equal(accept(judge.invoke("evaluate", {seat: "alpha"})).passed, true);
  assert.equal(accept(judge.invoke("evaluate", {seat: "bravo"})).passed, false);
  const result = accept(judge.invoke("finalize"));
  assert.deepEqual(result.winners, ["alpha"]);
  assert.equal(git("rev-parse", "HEAD"), base);
  assert.equal(readFileSync(join(repo, "answer.txt"), "utf8"), "baseline\n");
  const {archive, path} = match.exportEvidence();
  const rebuilt = replayMatch(JSON.parse(readFileSync(path)), {tip: archive.tip});
  assert.deepEqual(rebuilt.result, result);
  assert.equal(rebuilt.submissions.alpha.commit, a.commit);
  const patch = readFileSync(join(path, "..", a.patch.path));
  assert.equal(sha256(patch), a.patch.sha256);
  assert.equal(rebuilt.evaluations.bravo.passed, false);
  assert.ok(rebuilt.history.some(entry => entry.type === "DENIAL_RECEIPT"));
  assert.equal(JSON.stringify(archive).includes("intrusion"), false);
  archive.receipts.reverse();
  assert.throws(() => replayMatch(archive), /chain/);
});

test("broker rejects symlink, private file, spoofed actor, and writes after budget exhaustion", t => {
  const {match, session, config} = fixture(t, m => {
    m.coding.files.push("link.txt");
    m.seats.find(s => s.id === "alpha").budget.turns = 4;
  });
  assert.throws(() => match.openSeat("alpha", config.seats.find(s => s.id === "bravo").operator), /actor/);
  const alpha = session("alpha");
  assert.equal(alpha.invoke("read", {path: "private.txt"}).reason, "file-scope");
  assert.equal(alpha.invoke("read", {path: "link.txt"}).reason, "file-scope");
  assert.equal(alpha.invoke("write", {path: "link.txt", content: "no"}).reason, "file-scope");
  assert.equal(accept(alpha.invoke("read", {path: "answer.txt"})).content, "baseline\n");
  assert.equal(alpha.invoke("write", {path: "answer.txt", content: "no"}).reason, "turn-budget");
});

test("terminal sandbox uses isolated workspace, hides host variables, and bounds commands", t => {
  process.env.WARFORGE_CANARY = "host-only";
  t.after(() => delete process.env.WARFORGE_CANARY);
  const {session} = fixture(t, m => {
    const job = m.coding.commands[0];
    job.args = ["-e", "const f=require('node:fs'); if(process.env.WARFORGE_CANARY || f.existsSync('.git') || f.existsSync('private.txt') || f.existsSync('/workspace/../repo')) process.exit(5); try { f.writeFileSync('answer.txt','no'); process.exit(6); } catch(e) { if(e.code !== 'EROFS') process.exit(7); }"];
    m.coding.commands.push({id: "slow", kind: "test", tool: "node", args: ["-e", "setInterval(()=>{},1000)"], timeout_ms: 100, points: 0, terminal: true});
  });
  const alpha = session("alpha");
  assert.equal(accept(alpha.invoke("run", {id: "readiness"})).passed, true);
  const slow = accept(alpha.invoke("run", {id: "slow"}));
  assert.equal(slow.timed_out, true);
  assert.equal(slow.passed, false);
  assert.equal(accept(alpha.invoke("read", {path: "answer.txt"})).content, "baseline\n");
});

test("seat can disconnect and rejoin only within its declared allowance", t => {
  const {match, session} = fixture(t);
  const alpha = session("alpha");
  accept(alpha.invoke("disconnect"));
  assert.equal(alpha.invoke("read", {path: "answer.txt"}).reason, "seat-disconnected");
  accept(alpha.invoke("rejoin"));
  assert.equal(accept(alpha.invoke("read", {path: "answer.txt"})).content, "baseline\n");
  accept(alpha.invoke("disconnect"));
  assert.equal(alpha.invoke("rejoin").reason, "rejoin-budget");
  const {archive} = match.exportEvidence();
  assert.equal(replayMatch(archive).seats.alpha, "disconnected");
});

test("judge evaluates committed bytes even when Git ignores a permitted new file", t => {
  const {session} = fixture(t, m => {
    m.coding.files.push("ignored.txt");
    m.coding.commands[1].args = ["-e", "require('node:fs').accessSync('ignored.txt')"];
  });
  const alpha = session("alpha");
  accept(alpha.invoke("write", {path: "ignored.txt", content: "candidate"}));
  const submission = accept(alpha.invoke("submit"));
  assert.equal(submission.patch.size, 0);
  assert.equal(accept(session("judge").invoke("evaluate", {seat: "alpha"})).passed, false);
});

test("coding policy rejects unsupported runtime authority and mismatched worktree scope", t => {
  assert.throws(() => fixture(t, m => {
    m.seats.find(s => s.id === "alpha").permissions.repo_scope = ["worktree:bravo"];
  }), /repo_scope/);
  assert.throws(() => fixture(t, m => {
    const bridge = m.bridges.find(b => b.id.endsWith("github"));
    bridge.actions.push("push");
    bridge.capabilities.push("push");
  }), /unsupported coding/);
  assert.throws(() => fixture(t, m => {
    m.coding.commands.push({...m.coding.commands[0], points: 0});
  }), /duplicate check/);
});

test("human referee intervention is explicit and can resolve an unfinished match", t => {
  const {match, session} = fixture(t);
  const judge = session("judge");
  assert.equal(judge.invoke("finalize").reason, "match-incomplete");
  assert.equal(session("alpha").invoke("intervene", {seat: "bravo"}).reason, "denied");
  accept(session("operator").invoke("intervene", {seat: "bravo"}));
  assert.equal(session("bravo").invoke("write", {path: "answer.txt", content: "late"}).reason, "seat-terminated");
  accept(session("alpha").invoke("fail"));
  assert.deepEqual(accept(judge.invoke("finalize")).winners, []);
  const {archive} = match.exportEvidence();
  const recorded = archive.receipts.find(receipt => receipt.payload.target === "bravo" && receipt.payload.status === "terminated");
  assert.equal(recorded.seat, "operator");
  assert.equal(recorded.actor, "warforge://operator/lokivelli");
});

test("replay rejects a modified artifact and a substituted archive header", t => {
  const {match, session} = fixture(t);
  const submitted = accept(session("alpha").invoke("submit"));
  const {archive, path} = match.exportEvidence();
  assert.equal(verifyArtifacts(path, replayMatch(archive).history), 1);
  const changed = {...archive, base: "unauthenticated"};
  assert.throws(() => replayMatch(changed), /metadata/);
  writeFileSync(join(path, "..", submitted.patch.path), "wrong");
  assert.throws(() => verifyArtifacts(path, replayMatch(archive).history), /artifact/);
});

test("coding manifests reject provider substitution and sandbox shows only allowed commands", t => {
  assert.throws(() => fixture(t, m => {
    m.seats.find(s => s.id === "alpha").adapter = "codex";
  }), /adapter/);
  const {session} = fixture(t);
  const alpha = session("alpha");
  assert.deepEqual(accept(alpha.invoke("context")).commands, ["readiness"]);
  assert.equal(alpha.invoke("run", {id: "acceptance"}).reason, "unsupported-command");
});

test("a declared spectator can observe the completed public result", t => {
  const {session} = fixture(t);
  const observer = session("operator");
  const alpha = session("alpha");
  const bravo = session("bravo");
  const judge = session("judge");
  accept(alpha.invoke("terminate"));
  accept(bravo.invoke("terminate"));
  const result = accept(judge.invoke("finalize"));
  assert.deepEqual(accept(observer.invoke("observe")), {result});
  assert.deepEqual(alpha.view(), {result});
  assert.equal(bravo.invoke("observe").reason, "denied");
});

test("deadline expires unresolved seats before the deterministic judge can finalize", async t => {
  const {session} = fixture(t, m => {m.coding.match_timeout_ms = 5;});
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(session("alpha").invoke("read", {path: "answer.txt"}).reason, "seat-timed-out");
  const result = accept(session("judge").invoke("finalize"));
  assert.deepEqual(result.winners, []);
  assert.ok(result.seats.every(seat => seat.status === "timed-out"));
});

test("standalone worktree and judge entry points exercise the same local boundary", t => {
  const {repo, base, git} = fixture(t);
  const helper = new URL("../scripts/create-seat-worktree.sh", import.meta.url).pathname;
  const judge = new URL("../scripts/judge.mjs", import.meta.url).pathname;
  const created = JSON.parse(execFileSync(helper, ["entry-test", "alpha", "HEAD"], {cwd: repo, encoding: "utf8"}));
  try {
    assert.equal(created.base, base);
    assert.equal(created.branch, "warforge/entry-test/alpha");
    writeFileSync(join(created.worktree, "answer.txt"), "local\n");
    assert.equal(readFileSync(join(repo, "answer.txt"), "utf8"), "baseline\n");
    const execute = source => execFileSync(process.execPath, [judge, created.worktree, "node", "-e", source], {
      cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
    });
    const success = JSON.parse(execute("if(require('node:fs').readFileSync('answer.txt','utf8') !== 'local\\n') process.exit(4)"));
    assert.equal(success.exit_code, 0);
    assert.equal(JSON.parse(readFileSync(join(repo, success.receipt))).receipt_hash, success.hash);
    assert.throws(() => execute("process.exit(7)"), error => {
      return error.status === 7 && JSON.parse(error.stdout).exit_code === 7;
    });
  } finally {
    git("worktree", "remove", "--force", created.worktree);
    rmSync(join(created.worktree, ".."), {recursive: true, force: true});
  }
});

test("signed-only coding seats require a fresh packet and still enforce ordinary bridge and budget gates", t => {
  const {privateKey, publicKey} = generateKeyPairSync("ed25519");
  const {match, config} = fixture(t, m => { m.seats.find(s => s.id === "alpha").budget.turns = 2; },
    {authorityPublicKey: publicKey});
  const {id, operator} = config.seats.find(s => s.id === "alpha");
  assert.throws(() => match.openSeat(id, operator), /signed seat required/);
  assert.throws(() => match.openSignedSeat(id, "other"), /actor-seat/);
  const alpha = match.openSignedSeat(id, operator);
  const issue = (action, input) => signAuthorityPacket(privateKey, alpha.scope, action, input, Date.now() + 60000);
  assert.equal(alpha.invoke({}).reason, "invalid-authority");
  const write = issue("write", {path: "answer.txt", content: "signed-private-content"});
  accept(alpha.invoke(JSON.parse(JSON.stringify(write))));
  assert.equal(alpha.invoke(write).reason, "authority-replayed");
  const read = accept(alpha.invoke(issue("read", {path: "answer.txt"})));
  assert.equal(read.content, "signed-private-content");
  const excess = issue("read", {path: "answer.txt"});
  assert.equal(alpha.invoke(excess).reason, "turn-budget");
  assert.equal(alpha.invoke(excess).reason, "authority-replayed");
  assert.equal(alpha.invoke(issue("evaluate", {seat: id})).reason, "denied");
  const {archive} = match.exportEvidence();
  const {history} = replayMatch(archive, {tip: archive.tip});
  assert.equal(history.filter(r => r.payload.event === "authority-verified").length, 4);
  assert.ok(history.some(r => r.type === "DENIAL_RECEIPT" && r.payload.decision === "invalid-authority"));
  assert.equal(JSON.stringify(history).includes("signed-private-content"), false);
  assert.equal(JSON.stringify(history).includes(write.signature), false);
  match.close();
  assert.equal(alpha.invoke(issue("context")).reason, "match-closed");
});
