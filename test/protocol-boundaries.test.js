import test from "node:test";
import assert from "node:assert/strict";
import manifest from "../examples/coding-deathmatch.json" with {type: "json"};
import { BridgeRegistry } from "../src/bridge-registry.js";
import { ReceiptLedger, validateManifest } from "../src/core.js";
import { WarforgeMatch } from "../src/match.js";

const bridge = "warforge://bridge/github";
const alpha = manifest.seats.find(seat => seat.id === "alpha").operator;
const bravo = manifest.seats.find(seat => seat.id === "bravo").operator;
const judge = manifest.seats.find(seat => seat.id === "judge").operator;

test("manifest rejects duplicate identities and dangling references", () => {
  const cases = [
    [m => m.operators.push(m.operators[0]), /duplicate operator/],
    [m => m.seats.push(m.seats[0]), /duplicate seat/],
    [m => { m.seats[0].operator = "warforge://operator/missing"; }, /unknown operator/],
    [m => { m.bridges[0].permissions.missing = {actions: ["read"]}; }, /unknown seat/],
    [m => { m.judge.id = "warforge://operator/missing"; }, /judge/],
    [m => { m.mode = "anything"; }, /mode/]
  ];
  for (const [change, message] of cases) {
    const candidate = structuredClone(manifest);
    change(candidate);
    assert.throws(() => validateManifest(candidate), message);
  }
});

test("bridge registry snapshots definitions and rejects duplicate registration", () => {
  const registry = new BridgeRegistry();
  const definition = manifest.bridges.find(item => item.id === bridge);
  registry.register(definition);
  assert.throws(() => registry.register(definition), /duplicate bridge/);
  registry.get(bridge).permissions.bravo.actions.length = 0;
  assert.equal(registry.authorize(bridge, "bravo", "read").ok, true);
  assert.equal(registry.authorize(bridge, "bravo", "unavailable").reason, "unsupported-action");
});

test("match binds actor and seat and dispatches only governed capabilities", () => {
  let commits = 0;
  const match = new WarforgeMatch(manifest, {
    handlers: {[bridge]: {submit: () => ({committed: ++commits})}}
  });
  const request = (actor, seat, action) => match.request({bridge, actor, seat, action, payload: {token: "never-log"}});
  assert.equal(request(bravo, "alpha", "submit").reason, "actor-seat-mismatch");
  assert.equal(request(alpha, "alpha", "unavailable").reason, "unsupported-action");
  assert.equal(request(judge, "judge", "submit").reason, "denied");
  assert.equal(request(alpha, "alpha", "read").reason, "unsupported-action");
  assert.equal(request(alpha, "alpha", "submit").result.committed, 1);
  assert.equal(commits, 1);
  assert.equal(match.ledger.all().filter(r => r.type === "DENIAL_RECEIPT").length, 4);
  assert.equal(JSON.stringify(match.ledger.all()).includes("never-log"), false);
});

test("match projections protect native, judge, and other-seat state", () => {
  const match = new WarforgeMatch(manifest);
  const value = {count: 1};
  match.setState("public", value);
  value.count = 2;
  match.setState("alpha", "private", {class: "SEAT_PRIVATE", seat: "alpha"});
  match.setState("hidden", "judge", {class: "JUDGE_ONLY"});
  match.setState("native", "secret", {class: "APP_PRIVATE"});
  assert.throws(() => match.setState("invalid", "secret", {class: "UNKNOWN"}));
  assert.throws(() => match.view("alpha", {actor: bravo}), /actor/);
  assert.deepEqual(match.view("bravo", {actor: bravo, judge: true}), {public: {count: 1}});
  assert.deepEqual(match.view("alpha", {actor: alpha}), {public: {count: 1}, alpha: "private"});
  assert.deepEqual(match.view("judge", {actor: judge}), {public: {count: 1}, hidden: "judge"});
  const snapshot = match.view("alpha", {actor: alpha});
  snapshot.public.count = 3;
  assert.equal(match.view("alpha", {actor: alpha}).public.count, 1);
  assert.equal(JSON.stringify(match.ledger.all()).includes("secret"), false);
});

test("receipt ledger imports and verifies evidence with an optional trusted tip", () => {
  const ledger = new ReceiptLedger();
  const payload = {result: {pass: true}};
  ledger.append({match_id: "m", type: "TEST_RECEIPT", actor: "judge", seat: "judge", payload});
  payload.result.pass = false;
  ledger.all()[0].payload.result.pass = false;
  const evidence = structuredClone(ledger.all());
  assert.equal(evidence[0].payload.result.pass, true);
  const tip = evidence[0].receipt_hash;
  assert.equal(ReceiptLedger.verify(evidence, {matchId: "m", tip}), true);
  assert.equal(ReceiptLedger.verify(evidence, {matchId: "other", tip}), false);
  assert.equal(ReceiptLedger.verify([], {tip}), false);
  evidence[0].payload.result.pass = false;
  assert.equal(ReceiptLedger.verify(evidence), false);
});
