import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { BRIDGES, CODER_ADDRESS, OPERATIONS } from "./coder-adapter.js";
import { assert, sha256, validateManifest } from "./core.js";
import { MatchAuthority } from "./authority.js";
import { ActionError, WarforgeMatch } from "./match.js";
import { checkSandbox, runSandboxed } from "./sandbox.js";
import { createWorktree, git, readCommitFile, readWorktreeFile, removeWorktree, repositoryBase, writeWorktreeFile } from "./worktrees.js";

const SYSTEM = "warforge://system";
const LIFECYCLE = new Set(["disconnect", "rejoin", "terminate", "fail"]);
const TERMINAL = new Set(["failed", "terminated", "timed-out"]);

function input(payload, ...keys) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || Object.keys(payload).length !== keys.length || keys.some(key => !Object.hasOwn(payload, key))) {
    throw new ActionError("invalid-input");
  }
  return payload;
}

export class CodingDeathmatch {
  #match;
  #authority;
  #manifest;
  #policy;
  #coders = new Map();
  #seats;
  #repository;
  #workspace;
  #output;
  #deadline;
  #taskHash;
  #result;
  #closed = false;

  constructor(manifest, {repository, output, authorityPublicKey}) {
    validateManifest(manifest);
    assert(manifest.coding, "coding policy required");
    this.#manifest = structuredClone(manifest);
    this.#policy = this.#manifest.coding;
    this.#seats = new Map(this.#manifest.seats.map(seat => [seat.id, seat]));
    this.#taskHash = sha256(this.#policy.task);
    if (authorityPublicKey !== undefined) {
      this.#authority = new MatchAuthority(authorityPublicKey, this.#manifest.match_id, this.#taskHash);
    }
    this.#match = new WarforgeMatch(this.#manifest, {
      guard: context => this.#guard(context),
      handlers: this.#handlers()
    });
    checkSandbox();
    this.#repository = repositoryBase(repository, this.#policy.base_ref);
    this.#output = resolve(output);
    mkdirSync(this.#output, {mode: 0o700});
    this.#workspace = mkdtempSync(join(tmpdir(), "warforge-seats-"));
    this.#record("STATE_RECEIPT", {seat: null, actor: SYSTEM}, {
      event: "match-initialized", base: this.#repository.base, task_sha256: this.#taskHash,
      manifest_sha256: sha256(this.#manifest)
    });
    try {
      for (const seat of this.#manifest.seats.filter(seat => seat.role === "coder")) {
        const work = createWorktree(this.#repository.root, this.#workspace, this.#manifest.match_id,
          seat.id, this.#repository.base);
        const coder = {...work, status: "active", turns: 0, rejoins: 0};
        this.#coders.set(seat.id, coder);
        this.#record("STATE_RECEIPT", {seat: seat.id, actor: SYSTEM}, {
          event: "seat-initialized", operator: seat.operator, address: CODER_ADDRESS, branch: work.branch,
          worktree: work.worktree, base: work.base, task_sha256: this.#taskHash,
          permissions: seat.permissions, budget: seat.budget, adapter: seat.adapter, status: "active"
        });
      }
    } catch (error) {
      try {
        this.close();
        for (const {branch} of this.#coders.values()) git(this.#repository.root, ["branch", "-D", "--", branch]);
      } finally {
        rmSync(this.#output, {recursive: true, force: true});
      }
      throw error;
    }
    const start = performance.now();
    this.#deadline = start + this.#policy.match_timeout_ms;
    for (const [id, coder] of this.#coders) {
      coder.deadline = Math.min(this.#deadline, start + this.#seats.get(id).budget.wall_ms);
    }
  }

  #handlers() {
    return {
      [BRIDGES.coder]: {
        context: (data, who) => this.#context(input(data), who),
        progress: (data, who) => this.#progress(input(data), who),
        disconnect: (data, who) => this.#disconnect(input(data), who),
        rejoin: (data, who) => this.#rejoin(input(data), who),
        terminate: (data, who) => this.#end(input(data), who, "terminated"),
        fail: (data, who) => this.#end(input(data), who, "failed"),
        intervene: (data, who) => this.#intervene(input(data, "seat"), who),
        observe: (data, who) => {
          input(data);
          return this.#match.view(who.seat, {actor: who.actor});
        }
      },
      [BRIDGES.github]: {
        read: (data, who) => this.#read(input(data, "path"), who),
        write: (data, who) => this.#write(input(data, "path", "content"), who),
        submit: (data, who) => this.#submit(input(data), who),
        artifact: (data, who) => this.#artifact(input(data, "id"), who)
      },
      [BRIDGES.terminal]: {
        run: (data, who) => this.#terminal(input(data, "id"), who)
      },
      [BRIDGES.judge]: {
        evaluate: (data, who) => this.#evaluate(input(data, "seat"), who),
        finalize: (data, who) => this.#finalize(input(data), who)
      }
    };
  }

  #checkSeat(seat, actor) {
    assert(!this.#closed, "match closed");
    assert(this.#seats.has(seat) && this.#seats.get(seat).operator === actor, "actor-seat mismatch");
  }

  #invoke(seat, actor, action, payload) {
    if (this.#closed) return {ok: false, reason: "match-closed"};
    return this.#match.request({
      action, payload, seat, actor, bridge: Object.hasOwn(OPERATIONS, action) ? OPERATIONS[action] : null
    });
  }

  openSeat(seat, actor) {
    this.#checkSeat(seat, actor);
    assert(!this.#authority, "signed seat required");
    return Object.freeze({
      invoke: (action, payload) => this.#invoke(seat, actor, action, payload),
      view: () => this.#match.view(seat, {actor})
    });
  }

  openSignedSeat(seat, actor) {
    this.#checkSeat(seat, actor);
    assert(this.#authority, "no signing authority configured");
    const scope = this.#authority.scope(seat, actor);
    return Object.freeze({
      scope,
      invoke: packet => {
        if (this.#closed) return {ok: false, reason: "match-closed"};
        const decision = this.#authority.consume(packet, seat, actor);
        if (!decision.ok) {
          this.#record("DENIAL_RECEIPT", {seat, actor}, {decision: decision.reason});
          return decision;
        }
        this.#record("PERMISSION_RECEIPT", {seat, actor}, {event: "authority-verified", nonce: decision.nonce});
        return this.#invoke(seat, actor, decision.action, decision.input);
      }
    });
  }

  #record(type, who, payload) {
    return this.#match.record(type, {...who, payload});
  }

  #setStatus(id, coder, status, who, type = "STATE_RECEIPT") {
    coder.status = status;
    this.#record(type, who, {event: "seat-status", target: id, status});
    return {status};
  }

  #guard({seat, actor, action}) {
    if (this.#closed) throw new ActionError("match-closed");
    if (action === "observe") return;
    if (this.#result) throw new ActionError("match-finished");
    const coder = this.#coders.get(seat);
    if (!coder) {
      if (performance.now() >= this.#deadline && action !== "finalize") throw new ActionError("match-timeout");
      return;
    }
    if (["active", "disconnected"].includes(coder.status) && performance.now() >= coder.deadline) {
      this.#setStatus(seat, coder, "timed-out", {seat, actor: SYSTEM});
    }
    if (coder.status === "disconnected" && action === "rejoin") return;
    if (coder.status === "disconnected" && LIFECYCLE.has(action) && action !== "disconnect") return;
    if (coder.status !== "active") throw new ActionError(`seat-${coder.status}`);
    if (action === "context" || LIFECYCLE.has(action)) return;
    if (coder.turns >= this.#seats.get(seat).budget.turns) throw new ActionError("turn-budget");
    coder.turns++;
  }

  #context(_data, {seat}) {
    const coder = this.#coders.get(seat);
    const config = this.#seats.get(seat);
    return {
      address: CODER_ADDRESS, match_id: this.#manifest.match_id, seat, base: coder.base,
      branch: coder.branch, task: structuredClone(this.#policy.task), task_sha256: this.#taskHash,
      adapter: config.adapter, files: [...this.#policy.files], permissions: structuredClone(config.permissions),
      budget: {...config.budget, remaining_turns: config.budget.turns - coder.turns,
        remaining_ms: Math.max(0, Math.floor(coder.deadline - performance.now()))},
      tools: [...this.#policy.tools], runtime: this.#policy.runtime, secrets: this.#policy.secrets,
      commands: this.#policy.commands.filter(job => job.terminal).map(job => job.id)
    };
  }

  #progress(_data, who) {
    const {turns, status} = this.#coders.get(who.seat);
    this.#record("STATE_RECEIPT", who, {event: "progress", turns, status});
    return {turns, status};
  }

  #disconnect(_data, who) {
    const coder = this.#coders.get(who.seat);
    coder.disconnected = performance.now();
    return this.#setStatus(who.seat, coder, "disconnected", who, "DISCONNECT_RECEIPT");
  }

  #rejoin(_data, who) {
    const coder = this.#coders.get(who.seat);
    const policy = this.#policy.disconnect;
    if (coder.status !== "disconnected") throw new ActionError("seat-not-disconnected");
    if (coder.rejoins >= policy.max_rejoins) throw new ActionError("rejoin-budget");
    if (performance.now() - coder.disconnected > policy.rejoin_within_ms) throw new ActionError("rejoin-expired");
    coder.rejoins++;
    return this.#setStatus(who.seat, coder, "active", who, "REJOIN_RECEIPT");
  }

  #end(_data, who, status) {
    return this.#setStatus(who.seat, this.#coders.get(who.seat), status, who);
  }

  #intervene({seat}, who) {
    const coder = this.#coders.get(seat);
    if (!coder || !["active", "disconnected"].includes(coder.status)) throw new ActionError("seat-not-intervenable");
    return this.#setStatus(seat, coder, "terminated", who);
  }

  #file(seat, path) {
    if (!this.#policy.files.includes(path)) throw new ActionError("file-scope");
    return this.#coders.get(seat).worktree;
  }

  #read({path}, {seat}) {
    return {content: readWorktreeFile(this.#file(seat, path), path).toString("utf8")};
  }

  #write({path, content}, who) {
    writeWorktreeFile(this.#file(who.seat, path), path, content);
    this.#record("STATE_RECEIPT", who, {event: "file-written", path, visibility: "SEAT_PRIVATE"});
    return {written: true};
  }

  #saveArtifact(seat, label, bytes, extension) {
    const hash = sha256(bytes);
    const path = `${seat}-${label}-${hash}.${extension}`;
    writeFileSync(join(this.#output, path), bytes, {mode: 0o600});
    return {path, sha256: hash, size: bytes.length};
  }

  #artifact({id}, who) {
    const spec = this.#policy.artifacts.find(item => item.id === id);
    if (!spec) throw new ActionError("unsupported-artifact");
    const bytes = readWorktreeFile(this.#file(who.seat, spec.path), spec.path);
    const artifact = this.#saveArtifact(who.seat, `artifact-${spec.id}`, bytes, "bin");
    this.#record("ARTIFACT_RECEIPT", who, {target: who.seat, id: spec.id, artifact});
    return artifact;
  }

  #submit(_data, who) {
    const coder = this.#coders.get(who.seat);
    const changes = git(coder.worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"], {bytes: true})
      .toString("utf8").split("\0").filter(Boolean).map(entry => entry.slice(3));
    if (changes.some(path => !this.#policy.files.includes(path))) throw new ActionError("file-scope");
    if (changes.length) {
      git(coder.worktree, ["add", "-A", "--", ...changes]);
      git(coder.worktree, ["-c", "user.name=Warforge", "-c", "user.email=warforge@localhost",
        "commit", "--quiet", "-m", `Warforge submission: ${who.seat}`]);
    }
    const commit = git(coder.worktree, ["rev-parse", "HEAD"]);
    const patch = this.#saveArtifact(who.seat, "submission", git(coder.worktree, [
      "diff", "--no-ext-diff", "--no-textconv", "--binary", coder.base, commit, "--"
    ], {bytes: true}), "patch");
    coder.submission = {commit, patch, changed_paths: changes};
    this.#record("ARTIFACT_RECEIPT", who, {event: "submission", target: who.seat, ...coder.submission});
    this.#setStatus(who.seat, coder, "submitted", who);
    return structuredClone(coder.submission);
  }

  #run(job, coder, who, target, judge) {
    const deadline = judge ? this.#deadline : coder.deadline;
    const timeout = Math.min(job.timeout_ms, Math.floor(deadline - performance.now()));
    const {stdout, stderr, ...evidence} = timeout > 0 ? runSandboxed({
      parent: this.#workspace,
      readFile: file => judge ? readCommitFile(this.#repository.root, coder.submission.commit, file)
        : readWorktreeFile(coder.worktree, file),
      files: judge ? this.#policy.judge_files ?? this.#policy.files : this.#policy.files,
      args: job.args, timeout
    }) : {
      passed: false, timed_out: true, output_limited: false, exit_code: null, signal: null,
      stdout_sha256: sha256(""), stderr_sha256: sha256("")
    };
    this.#record(job.kind === "build" ? "BUILD_RECEIPT" : "TEST_RECEIPT", who, {
      target, check: job.id, kind: job.kind, phase: judge ? "judge" : "coder", ...evidence
    });
    return judge ? evidence : {...evidence, stdout: stdout ?? "", stderr: stderr ?? ""};
  }

  #terminal({id}, who) {
    const job = this.#policy.commands.find(job => job.id === id && job.terminal);
    if (!job) throw new ActionError("unsupported-command");
    return this.#run(job, this.#coders.get(who.seat), who, who.seat, false);
  }

  #evaluate({seat}, who) {
    const coder = this.#coders.get(seat);
    if (!coder || coder.status !== "submitted") throw new ActionError("seat-not-submitted");
    if (coder.evaluation) throw new ActionError("already-evaluated");
    if (git(coder.worktree, ["rev-parse", "HEAD"]) !== coder.submission.commit
        || git(coder.worktree, ["status", "--porcelain=v1", "--untracked-files=all"])) {
      throw new ActionError("submission-changed");
    }
    const checks = this.#policy.commands.map(job => {
      const {passed} = this.#run(job, coder, who, seat, true);
      return {id: job.id, passed, points: passed ? job.points : 0};
    });
    for (const spec of this.#policy.artifacts) {
      let hash = null;
      try {
        hash = sha256(readCommitFile(this.#repository.root, coder.submission.commit, spec.path));
      } catch (error) {
        if (!(error instanceof ActionError)) throw error;
      }
      const passed = hash !== null && (spec.sha256 === undefined || spec.sha256 === hash);
      checks.push({id: spec.id, passed, points: passed ? spec.points : 0});
      this.#record("ARTIFACT_RECEIPT", who, {event: "artifact-check", target: seat, id: spec.id, sha256: hash, passed});
    }
    const passed = checks.every(check => check.passed);
    const score = checks.reduce((total, check) => total + check.points, 0);
    coder.evaluation = {commit: coder.submission.commit, passed, score, checks};
    this.#record("JUDGE_RECEIPT", who, {target: seat, ...coder.evaluation});
    this.#record("SCORE_RECEIPT", who, {target: seat, passed, score});
    return structuredClone(coder.evaluation);
  }

  #finalize(_data, who) {
    const now = performance.now();
    for (const [seat, coder] of this.#coders) {
      if (!coder.evaluation && !TERMINAL.has(coder.status)
          && (now >= this.#deadline || (coder.status !== "submitted" && now >= coder.deadline))) {
        this.#setStatus(seat, coder, "timed-out", {actor: SYSTEM, seat});
      }
    }
    const results = [...this.#coders].map(([seat, coder]) => ({
      seat, status: coder.evaluation ? (coder.evaluation.passed ? "passed" : "rejected") : coder.status,
      score: coder.evaluation?.score ?? null
    }));
    if (results.some(({status}) => !TERMINAL.has(status) && status !== "passed" && status !== "rejected")) {
      throw new ActionError("match-incomplete");
    }
    const best = Math.max(...results.filter(row => row.status === "passed").map(row => row.score));
    let winners = results.filter(row => row.status === "passed" && row.score === best).map(row => row.seat).sort();
    if (this.#policy.scoring.tie_breaker === "seat-id") winners = winners.slice(0, 1);
    this.#result = {winners, seats: results};
    this.#record("RESULT_RECEIPT", who, this.#result);
    this.#match.setState("result", this.#result);
    return structuredClone(this.#result);
  }

  exportEvidence() {
    const receipts = this.#match.ledger.all();
    const archive = {
      protocol: "warforge/1", match_id: this.#manifest.match_id, base: this.#repository.base,
      task_sha256: this.#taskHash, manifest_sha256: sha256(this.#manifest),
      tip: receipts.at(-1)?.receipt_hash ?? null, receipts
    };
    const path = join(this.#output, "archive.json");
    const pending = join(this.#output, `archive-${randomUUID()}.tmp`);
    try {
      writeFileSync(pending, JSON.stringify(archive, null, 2) + "\n", {mode: 0o600, flag: "wx"});
      renameSync(pending, path);
    } finally {
      rmSync(pending, {force: true});
    }
    return {archive, path};
  }

  close() {
    if (this.#closed) return;
    for (const work of this.#coders.values()) removeWorktree(this.#repository.root, work);
    rmSync(this.#workspace, {recursive: true, force: true});
    this.#closed = true;
  }
}
