import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ActionError } from "./match.js";
import { safeRepoPath } from "./core.js";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const maxFileBytes = 1024 * 1024;

export function git(repository, args, {bytes = false} = {}) {
  const invocation = [
    "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
    "-c", "commit.gpgsign=false", "-c", "gc.auto=0", "-c", "submodule.recurse=false", "--literal-pathspecs",
    "-C", repository, ...args
  ];
  const result = spawnSync("/usr/bin/git", invocation, {
    env: {PATH: "/usr/bin:/bin", HOME: "/nonexistent", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0"},
    timeout: 30_000, maxBuffer: 16 * maxFileBytes, killSignal: "SIGKILL"
  });
  if (result.status !== 0 || result.error) throw new Error(`Git operation failed (${args[0]})`);
  return bytes ? result.stdout : result.stdout.toString("utf8").trim();
}

export function repositoryBase(repository, ref = "HEAD") {
  const root = git(realpathSync(repository), ["rev-parse", "--show-toplevel"]);
  const config = git(root, ["config", "--name-only", "--list"]);
  if (config.split("\n").some(key => /^filter\..+\.(clean|smudge|process)$/i.test(key))) {
    throw new Error("repository config contains an unsupported Git filter driver");
  }
  const base = git(root, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  return {root, base};
}

export function createWorktree(repository, parent, match, seat, base) {
  if (!idPattern.test(match) || !idPattern.test(seat) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(base)) {
    throw new Error("invalid worktree identity or base");
  }
  const branch = `warforge/${match}/${seat}`;
  const worktree = join(parent, seat);
  git(repository, ["worktree", "add", "--quiet", "-b", branch, "--", worktree, base]);
  return {branch, worktree, base};
}

export function removeWorktree(repository, {worktree}) {
  git(repository, ["worktree", "remove", "--force", "--", worktree]);
}

export function readCommitFile(repository, commit, file) {
  if (!safeRepoPath(file)) throw new ActionError("file-scope");
  const entry = git(repository, ["ls-tree", commit, "--", file]);
  const match = /^100(?:644|755) blob ([a-f0-9]+)\t/.exec(entry);
  if (!match) throw new ActionError("file-scope");
  const [, blob] = match;
  if (Number(git(repository, ["cat-file", "-s", blob])) > maxFileBytes) throw new ActionError("file-size");
  return git(repository, ["cat-file", "blob", blob], {bytes: true});
}

function filePath(root, file, missing = false) {
  if (!safeRepoPath(file)) throw new ActionError("file-scope");
  const parts = file.split("/");
  let current = root;
  for (const [index, segment] of parts.entries()) {
    current = join(current, segment);
    const last = index === parts.length - 1;
    const stat = lstatSync(current, {throwIfNoEntry: false});
    if (last && !stat && missing) return current;
    if (!stat || (last ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) {
      throw new ActionError("file-scope");
    }
    if (last && stat.size > maxFileBytes) throw new ActionError("file-size");
  }
  return current;
}

export function readWorktreeFile(root, file) {
  return readFileSync(filePath(root, file));
}

export function writeWorktreeFile(root, file, content) {
  if (typeof content !== "string") throw new ActionError("invalid-input");
  if (Buffer.byteLength(content) > maxFileBytes) throw new ActionError("file-size");
  writeFileSync(filePath(root, file, true), content, {mode: 0o600});
}
