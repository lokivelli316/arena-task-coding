import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assert, ReceiptLedger, sha256 } from "./core.js";

export function replayMatch(archive, {tip = archive?.tip} = {}) {
  assert(archive?.protocol === "warforge/1" && typeof archive.match_id === "string"
    && typeof tip === "string" && tip === archive.tip
    && ReceiptLedger.verify(archive.receipts, {matchId: archive.match_id, tip}), "invalid receipt chain");
  const initial = archive.receipts[0]?.payload;
  assert(initial?.event === "match-initialized" && archive.base === initial.base
    && archive.task_sha256 === initial.task_sha256 && archive.manifest_sha256 === initial.manifest_sha256,
    "archive metadata disagrees with receipt chain");
  const seats = new Map();
  const submissions = new Map();
  const evaluations = new Map();
  let result = null;
  const history = structuredClone(archive.receipts);
  for (const {type, seat, payload} of history) {
    if (type === "STATE_RECEIPT" && payload.event === "seat-initialized") seats.set(seat, payload.status);
    if (payload.event === "seat-status") seats.set(payload.target, payload.status);
    if (type === "ARTIFACT_RECEIPT" && payload.event === "submission") submissions.set(payload.target, payload);
    if (type === "JUDGE_RECEIPT") evaluations.set(payload.target, payload);
    if (type === "RESULT_RECEIPT") result = payload;
  }
  return {match_id: archive.match_id, seats: Object.fromEntries(seats), submissions: Object.fromEntries(submissions),
    evaluations: Object.fromEntries(evaluations), result, history};
}

export function verifyArtifacts(archivePath, history) {
  const references = new Map();
  for (const {type, payload} of history) {
    if (type !== "ARTIFACT_RECEIPT") continue;
    const reference = payload.patch ?? payload.artifact;
    if (reference) references.set(reference.path, reference);
  }
  for (const {path, sha256: hash, size} of references.values()) {
    assert(typeof path === "string" && /^[A-Za-z0-9_-]+\.(patch|bin)$/.test(path), "invalid artifact path");
    const file = join(dirname(archivePath), path);
    const info = lstatSync(file, {throwIfNoEntry: false});
    assert(info?.isFile() && info.size === size && info.size <= 16 * 1024 * 1024, "artifact missing or wrong size");
    assert(sha256(readFileSync(file)) === hash, "artifact hash mismatch");
  }
  return references.size;
}
