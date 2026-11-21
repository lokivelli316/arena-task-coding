import { createHash, randomUUID } from "node:crypto";
import { BRIDGES, OPERATIONS } from "./coder-adapter.js";
import { matchSchema, receiptSchema, requireSchema } from "./schemas.js";

export const STATE_CLASSES = Object.freeze(["PUBLIC", "SEAT_PRIVATE", "JUDGE_ONLY", "APP_PRIVATE", "REPLAY_SAFE"]);

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value);
  return createHash("sha256").update(bytes).digest("hex");
}

function indexById(items, type) {
  const index = new Map();
  for (const item of items) {
    assert(!index.has(item.id), `duplicate ${type} ${item.id}`);
    index.set(item.id, item);
  }
  return index;
}

export function safeRepoPath(value) {
  return typeof value === "string" && value.length <= 512
    && value.split("/").every(part => /^[A-Za-z0-9._-]{1,128}$/.test(part)
      && ![".", "..", ".git", ".gitattributes"].includes(part.toLowerCase()));
}

function validateCodingPolicy(manifest, seats, operators) {
  const {coding} = manifest;
  assert(manifest.surface.type === "repository", "coding requires a repository surface");
  assert(manifest.judge.type === "deterministic", "coding requires the deterministic judge");
  assert(manifest.receipt_policy.required && manifest.receipt_policy.hash_chain, "coding requires hash-chained receipts");
  indexById([...coding.commands, ...coding.artifacts], "check");
  assert(coding.commands.some(command => command.kind !== "build"), "coding requires a test check");
  for (const file of [...coding.files, ...(coding.judge_files ?? [])]) {
    assert(safeRepoPath(file), "invalid coding file scope");
    assert(coding.files.includes(file), "judge_files must be within the coding file scope");
  }
  for (const spec of coding.artifacts) assert(coding.files.includes(spec.path), "artifact must be within file scope");
  const coders = [...seats.values()].filter(seat => seat.role === "coder");
  assert(coders.length >= (manifest.mode === "competitive" ? 2 : 1), "insufficient coder seats");
  for (const seat of coders) {
    const type = operators.get(seat.operator).type;
    assert(["local", "human"].includes(seat.adapter), "coder adapter is required");
    assert(type !== "model" && (type === "human") === (seat.adapter === "human"), "coder adapter does not match operator type");
    const scope = seat.permissions.repo_scope;
    assert(scope?.length === 1 && scope[0] === `worktree:${seat.id}`, `invalid repo_scope for ${seat.id}`);
    for (const [key, maximum] of [["turns", 10000], ["wall_ms", 86400000]]) {
      const value = seat.budget?.[key];
      assert(Number.isSafeInteger(value) && value > 0 && value <= maximum, `invalid budget ${key} for ${seat.id}`);
    }
    assert(Object.keys(seat.budget).length === 2, "unsupported coding budget dimension");
  }
  for (const bridge of manifest.bridges) {
    for (const action of [...bridge.actions, ...bridge.capabilities]) {
      assert(Object.hasOwn(OPERATIONS, action) && OPERATIONS[action] === bridge.id, "unsupported coding bridge action or capability");
    }
    assert(Object.values(BRIDGES).includes(bridge.id), "unsupported coding bridge");
    for (const [id, {actions}] of Object.entries(bridge.permissions)) {
      const seat = seats.get(id);
      for (const action of actions) {
        if (bridge.id === BRIDGES.judge) {
          assert(seat.role === "judge" && seat.operator === manifest.judge.id, "judge action requires the designated judge seat");
        } else if (action === "intervene") {
          assert(["operator", "referee"].includes(seat.role), "intervention requires an operator or referee seat");
        } else if (action === "observe") {
          assert(["operator", "referee", "spectator"].includes(seat.role), "observe requires a spectator, referee, or operator seat");
        } else {
          assert(seat.role === "coder", "coding action requires a coder seat");
        }
      }
    }
  }
  const enabled = (seat, action) => !seat.permissions.forbidden_actions?.includes(action)
    && manifest.bridges.find(bridge => bridge.id === OPERATIONS[action])?.permissions[seat.id]?.actions.includes(action);
  for (const seat of coders) assert(enabled(seat, "context") && enabled(seat, "submit"), "coder requires context and submit grants");
  assert([...seats.values()].some(seat => enabled(seat, "evaluate") && enabled(seat, "finalize")),
    "designated judge requires evaluate and finalize grants");
}

export function validateManifest(manifest) {
  requireSchema(matchSchema, manifest);
  const operators = indexById(manifest.operators, "operator");
  const seats = indexById(manifest.seats, "seat");
  indexById(manifest.bridges, "bridge");

  for (const seat of seats.values()) {
    const operator = operators.get(seat.operator);
    assert(operator, `seat ${seat.id} references unknown operator`);
    assert(operator.roles.includes(seat.role), `operator does not declare seat role ${seat.role}`);
  }
  assert([...seats.values()].some(seat => seat.operator === manifest.judge.id && seat.role === "judge"),
    "judge must be assigned a judge seat");
  for (const bridge of manifest.bridges) {
    for (const [id, {actions}] of Object.entries(bridge.permissions)) {
      const seat = seats.get(id);
      assert(seat, `bridge references unknown seat ${id}`);
      for (const action of actions) {
        assert(bridge.actions.includes(action), `bridge permission grants unsupported action ${action}`);
        assert(seat.permissions.actions.includes(action), `bridge permission exceeds seat actions for ${id}`);
      }
    }
  }
  if (manifest.coding) validateCodingPolicy(manifest, seats, operators);
  return true;
}

export function visibleState(state, seat, judge = false) {
  return Object.fromEntries(Object.entries(state)
    .filter(([, field]) => field.class === "PUBLIC" || field.class === "REPLAY_SAFE"
      || (field.class === "JUDGE_ONLY" && judge)
      || (field.class === "SEAT_PRIVATE" && seat != null && field.seat === seat))
    .map(([key, field]) => [key, structuredClone(field.value)]));
}

export class ReceiptLedger {
  #receipts = [];

  append({match_id, type, actor, seat, payload = {}}) {
    const previous = this.#receipts.at(-1);
    assert(!previous || match_id === previous.match_id, "receipt belongs to another match");
    // Hash the durable JSON form. In-memory objects never alias the archived payload.
    const body = JSON.parse(JSON.stringify(payload));
    const base = {
      protocol: "warforge/1", receipt_id: randomUUID(), match_id, type, actor, seat,
      timestamp: new Date().toISOString(), payload_hash: sha256(body),
      previous_receipt_hash: previous?.receipt_hash ?? null, payload: body
    };
    const receipt = {...base, receipt_hash: sha256(base)};
    requireSchema(receiptSchema, receipt);
    this.#receipts.push(receipt);
    return structuredClone(receipt);
  }

  all() {
    return structuredClone(this.#receipts);
  }

  verify(options) {
    return ReceiptLedger.verify(this.#receipts, options);
  }

  static verify(receipts, {matchId, tip} = {}) {
    if (!Array.isArray(receipts)) return false;
    matchId ??= receipts[0]?.match_id;
    const ids = new Set();
    let previous = null;
    for (const receipt of receipts) {
      if (!receiptSchema(receipt) || receipt.match_id !== matchId || ids.has(receipt.receipt_id)) return false;
      const {receipt_hash, ...base} = receipt;
      if (base.previous_receipt_hash !== previous || sha256(base.payload) !== base.payload_hash
          || sha256(base) !== receipt_hash) return false;
      ids.add(receipt.receipt_id);
      previous = receipt_hash;
    }
    return tip === undefined || tip === previous;
  }
}
