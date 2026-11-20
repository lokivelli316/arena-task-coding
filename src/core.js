import { createHash, randomUUID } from "node:crypto";

export const STATE_CLASSES = Object.freeze(["PUBLIC","SEAT_PRIVATE","JUDGE_ONLY","APP_PRIVATE","REPLAY_SAFE"]);

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

export function validateManifest(m) {
  assert(m?.protocol === "warforge/1", "protocol must be warforge/1");
  for (const k of ["match_id","mode","surface","operators","seats","bridges","judge","receipt_policy"]) assert(m[k] != null, `missing ${k}`);
  const operators = new Set(m.operators.map(o => o.id));
  const seats = new Set();
  for (const s of m.seats) {
    assert(!seats.has(s.id), `duplicate seat ${s.id}`);
    seats.add(s.id);
    assert(operators.has(s.operator), `seat ${s.id} references unknown operator`);
    assert(s.permissions && typeof s.permissions === "object", `seat ${s.id} missing permissions`);
  }
  return true;
}

export function visibleState(state, seat, judge = false) {
  const out = {};
  for (const [key, field] of Object.entries(state)) {
    const c = field.class;
    if (c === "APP_PRIVATE") continue;
    if (c === "JUDGE_ONLY" && !judge) continue;
    if (c === "SEAT_PRIVATE" && field.seat !== seat) continue;
    out[key] = field.value;
  }
  return out;
}

export class ReceiptLedger {
  #receipts = [];
  append({match_id,type,actor,seat,payload={}}) {
    const previous_receipt_hash = this.#receipts.length ? this.#receipts.at(-1).receipt_hash : null;
    const base = {
      protocol:"warforge/1", receipt_id:randomUUID(), match_id, type, actor, seat,
      timestamp:new Date().toISOString(), payload_hash:sha256(payload), previous_receipt_hash, payload
    };
    const receipt_hash = sha256(base);
    const receipt = Object.freeze({...base,receipt_hash});
    this.#receipts.push(receipt);
    return receipt;
  }
  all(){ return [...this.#receipts]; }
  verify(){
    let prev=null;
    for(const r of this.#receipts){
      const {receipt_hash,...base}=r;
      if(r.previous_receipt_hash!==prev || sha256(base)!==receipt_hash) return false;
      prev=receipt_hash;
    }
    return true;
  }
}
