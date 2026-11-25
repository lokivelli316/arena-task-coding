import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { sha256 } from "./core.js";
import { ActionError } from "./match.js";

const bwrap = "/usr/bin/bwrap";
const maxOutput = 64 * 1024;

function invoke(argv, ms) {
  return spawnSync(bwrap, [
    "--unshare-all", "--unshare-user", "--disable-userns", "--die-with-parent", "--new-session", "--clearenv",
    "--setenv", "HOME", "/tmp", "--setenv", "CI", "1", "--setenv", "TZ", "UTC",
    "--ro-bind", "/usr/lib", "/usr/lib", "--symlink", "usr/lib", "/lib",
    "--symlink", "usr/lib64", "/lib64", "--ro-bind-try", "/usr/lib64", "/usr/lib64",
    "--dev", "/dev", "--tmpfs", "/tmp",
    "--ro-bind", realpathSync(process.execPath), "/runtime/node", ...argv
  ], {env: {}, timeout: ms, killSignal: "SIGKILL", maxBuffer: maxOutput});
}

export function checkSandbox() {
  if (process.platform !== "linux" || invoke(["--", "/runtime/node", "--version"], 3_000).status !== 0) {
    throw new Error("sandbox unavailable: requires Linux Bubblewrap with user namespaces and a supported Node runtime");
  }
}

export function runSandboxed({parent, files, readFile, args, timeout}) {
  if (timeout <= 0) throw new ActionError("time-budget");
  const deadline = performance.now() + timeout;
  const snapshot = mkdtempSync(join(parent, "command-"));
  try {
    for (const file of files) {
      if (performance.now() >= deadline) break;
      let contents;
      try {
        contents = readFile(file);
      } catch (error) {
        if (error instanceof ActionError && error.reason === "file-scope") continue;
        throw error;
      }
      const destination = join(snapshot, file);
      mkdirSync(dirname(destination), {recursive: true});
      writeFileSync(destination, contents);
    }
    const remaining = Math.floor(deadline - performance.now());
    const result = remaining > 0 ? invoke(["--ro-bind", snapshot, "/workspace", "--chdir", "/workspace", "--",
      "/runtime/node", ...args], remaining) : {status: null, signal: null, error: {code: "ETIMEDOUT"}};
    return {
      passed: result.status === 0 && !result.error,
      exit_code: result.status,
      signal: result.signal,
      timed_out: result.error?.code === "ETIMEDOUT",
      output_limited: result.error?.code === "ENOBUFS",
      stdout_sha256: sha256(result.stdout ?? Buffer.alloc(0)),
      stderr_sha256: sha256(result.stderr ?? Buffer.alloc(0)),
      stdout: result.stdout?.toString("utf8") ?? "",
      stderr: result.stderr?.toString("utf8") ?? ""
    };
  } finally {
    rmSync(snapshot, {recursive: true, force: true});
  }
}
