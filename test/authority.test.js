import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { MatchAuthority, signAuthorityPacket } from "../src/authority.js";

test("authority binds the signed bytes, designated key, instance, task, actor, seat and expiry", () => {
  const issuer = generateKeyPairSync("ed25519");
  const other = generateKeyPairSync("ed25519");
  const verifier = new MatchAuthority(issuer.publicKey, "m", "a".repeat(64));
  const scope = verifier.scope("alpha", "operator-a");
  const consume = packet => verifier.consume(packet, "alpha", "operator-a");
  const issue = (overrides = {}, key = issuer.privateKey, expiry = Date.now() + 60000) =>
    signAuthorityPacket(key, {...scope, ...overrides}, "write", {content: "original"}, expiry);
  const packet = issue();
  assert.equal(consume(null).reason, "invalid-authority");
  assert.equal(consume(issue({}, other.privateKey)).reason, "invalid-authority");
  assert.equal(consume({...packet, message: packet.message.replace("original", "changed")}).reason, "invalid-authority");
  for (const overrides of [{match_id: "other"}, {task_hash: "b".repeat(64)}, {seat: "bravo"}, {actor: "other"}]) {
    assert.equal(consume(issue(overrides)).reason, "invalid-authority");
  }
  const recreated = new MatchAuthority(issuer.publicKey, scope.match_id, scope.task_hash);
  assert.equal(recreated.consume(packet, scope.seat, scope.actor).reason, "invalid-authority");
  assert.equal(consume(issue({}, issuer.privateKey, Date.now())).reason, "authority-expired");
  for (const message of ["{", "{}"]) {
    assert.equal(consume({message, signature: sign(null, Buffer.from(message), issuer.privateKey).toString("base64url")}).reason,
      "invalid-authority");
  }
  const decision = consume(packet);
  assert.equal(decision.action, "write");
  assert.deepEqual(decision.input, {content: "original"});
  assert.equal(consume(packet).reason, "authority-replayed");
  assert.throws(() => new MatchAuthority(issuer.privateKey, "m", scope.task_hash), /public/);
});
