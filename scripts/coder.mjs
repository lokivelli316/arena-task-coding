import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { CODER_ADDRESS, HumanCoderAdapter, LocalCoderAdapter } from "../src/coder-adapter.js";
import { CodingDeathmatch } from "../src/coding-match.js";
import { replayMatch, verifyArtifacts } from "../src/replay.js";

const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const print = value => console.log(JSON.stringify(value));

async function hostMatch(mode, manifestPath, repository, output, planPath) {
  const manifest = readJson(manifestPath);
  const plan = mode === "run" ? readJson(planPath) : null;
  if (mode === "run" && !Array.isArray(plan)) throw new Error("plan must be an array of steps");
  const match = new CodingDeathmatch(manifest, {repository, output});
  const adapt = seat => {
    const operator = manifest.operators.find(operator => operator.id === seat.operator);
    const Adapter = seat.adapter === "human" ? HumanCoderAdapter : LocalCoderAdapter;
    return new Adapter(match.openSeat(seat.id, operator.id));
  };
  const adapters = new Map(manifest.seats.map(seat => [seat.id, adapt(seat)]));
  const execute = step => {
    if (!step || typeof step.operation !== "string" || !adapters.has(step.seat)) {
      throw new Error("step requires a known seat and operation");
    }
    return adapters.get(step.seat).invoke(step.operation, step.input);
  };

  let evidence;
  try {
    if (mode === "run") {
      for (const [index, step] of plan.entries()) {
        const result = execute(step);
        if (step.expect === undefined ? !result.ok : result.ok || result.reason !== step.expect) {
          throw new Error(`step ${index + 1} did not produce the expected response`);
        }
      }
    } else {
      const lines = createInterface({input: process.stdin, terminal: false});
      for await (const line of lines) {
        if (!line.trim()) continue;
        try {
          print(execute(JSON.parse(line)));
        } catch {
          print({ok: false, reason: "invalid-step"});
        }
      }
    }
  } finally {
    try {
      evidence = match.exportEvidence();
      const summary = replayMatch(evidence.archive);
      print({address: CODER_ADDRESS, evidence: evidence.path, tip: evidence.archive.tip, result: summary.result});
    } finally {
      match.close();
    }
  }
  if (mode === "run" && !replayMatch(evidence.archive).result) throw new Error("plan ended before finalization");
}

async function main(args) {
  const [mode, first, second, third, fourth] = args;
  if (mode === "replay" && first && args.length <= 3) {
    const archive = readJson(first);
    const {history, ...summary} = replayMatch(archive, {tip: second});
    const artifacts = verifyArtifacts(first, history);
    print({...summary, receipts: history.length, artifacts, tip: archive.tip});
  } else if ((mode === "run" && args.length === 5) || (mode === "interactive" && args.length === 4)) {
    await hostMatch(mode, first, second, third, fourth);
  } else if (args.length === 0 || mode === "--help") {
    console.log(`Operator ${CODER_ADDRESS}
  npm run coder -- run <manifest.json> <git-repository> <new-evidence-directory> <plan.json>
  npm run coder -- interactive <manifest.json> <git-repository> <new-evidence-directory>
  npm run coder -- replay <archive.json> [trusted-receipt-tip]`);
  } else {
    throw new Error("invalid arguments (use --help)");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
