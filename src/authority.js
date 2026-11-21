import { KeyObject, randomUUID, sign, verify } from "node:crypto";
import { authoritySchema, requireSchema } from "./schemas.js";

function checkKey(key, type) {
  if (!(key instanceof KeyObject) || key.type !== type || key.asymmetricKeyType !== "ed25519") {
    throw new TypeError(`expected an Ed25519 ${type} KeyObject`);
  }
}

// The issuer retains its private key. Sign exactly the UTF-8 bytes the host will parse.
export function signAuthorityPacket(privateKey, scope, action, input = {}, expiresAt) {
  checkKey(privateKey, "private");
  const message = JSON.stringify({...scope, protocol: "warforge/authority/1",
    action, input, expires_at: expiresAt, nonce: randomUUID()});
  requireSchema(authoritySchema, JSON.parse(message));
  return {message, signature: sign(null, Buffer.from(message), privateKey).toString("base64url")};
}

export class MatchAuthority {
  #key;
  #scope;
  #used = new Set();

  constructor(publicKey, matchId, taskHash) {
    checkKey(publicKey, "public");
    this.#key = publicKey;
    this.#scope = {match_id: matchId, task_hash: taskHash, instance: randomUUID()};
  }

  scope(seat, actor) {
    return Object.freeze({...this.#scope, seat, actor});
  }

  consume(packet, seat, actor) {
    const {message, signature} = packet ?? {};
    if (typeof message !== "string" || typeof signature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(signature)) {
      return {ok: false, reason: "invalid-authority"};
    }
    const bytes = Buffer.from(message);
    if (!verify(null, bytes, this.#key, Buffer.from(signature, "base64url"))) {
      return {ok: false, reason: "invalid-authority"};
    }
    let claims;
    try { claims = JSON.parse(bytes.toString("utf8")); }
    catch { return {ok: false, reason: "invalid-authority"}; }
    if (!authoritySchema(claims) || Object.entries(this.scope(seat, actor)).some(([key, value]) => claims[key] !== value)) {
      return {ok: false, reason: "invalid-authority"};
    }
    if (claims.expires_at <= Date.now()) return {ok: false, reason: "authority-expired"};
    if (this.#used.has(claims.nonce)) return {ok: false, reason: "authority-replayed"};
    this.#used.add(claims.nonce);
    return {ok: true, action: claims.action, input: claims.input, nonce: claims.nonce};
  }
}
