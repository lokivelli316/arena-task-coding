import { assert, validateManifest, visibleState, ReceiptLedger, STATE_CLASSES } from "./core.js";
import { BridgeRegistry } from "./bridge-registry.js";

export class ActionError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// Host API. The caller authenticates the channel before supplying its actor identity.
export class WarforgeMatch {
  #manifest;
  #state = Object.create(null);
  #seats;
  #bridges = new BridgeRegistry();
  #handlers = new Map();
  #guard;
  #ledger = new ReceiptLedger();

  constructor(manifest, {handlers = {}, guard} = {}) {
    validateManifest(manifest);
    this.#manifest = structuredClone(manifest);
    this.#seats = new Map(this.#manifest.seats.map(seat => [seat.id, seat]));
    for (const bridge of this.#manifest.bridges) {
      this.#bridges.register(bridge);
      this.#handlers.set(bridge.id, new Map(Object.entries(handlers[bridge.id] ?? {})));
    }
    this.#guard = guard;
  }

  get manifest() {
    return structuredClone(this.#manifest);
  }

  get bridges() {
    return this.#bridges.list();
  }

  get ledger() {
    return this.#ledger;
  }

  record(type, {actor, seat, payload}) {
    return this.#ledger.append({match_id: this.#manifest.match_id, type, actor, seat, payload});
  }

  setState(key, value, {class: stateClass = "PUBLIC", seat} = {}) {
    assert(STATE_CLASSES.includes(stateClass), "unknown state class");
    assert(stateClass !== "SEAT_PRIVATE" || this.#seats.has(seat), "private state requires a known seat");
    this.#state[key] = {class: stateClass, seat, value: structuredClone(value)};
    if (stateClass === "APP_PRIVATE") return;
    const payload = {visibility: stateClass};
    if (stateClass === "PUBLIC" || stateClass === "REPLAY_SAFE") payload.key = key;
    this.record("STATE_RECEIPT", {actor: "warforge://system", seat: seat ?? null, payload});
  }

  view(seat, {actor} = {}) {
    const assigned = this.#seats.get(seat);
    if (seat !== undefined) assert(assigned && assigned.operator === actor, "actor-seat mismatch");
    return visibleState(this.#state, seat, assigned?.role === "judge");
  }

  request({bridge, seat, actor, action, payload = {}}) {
    const assigned = this.#seats.get(seat);
    const definition = this.#bridges.get(bridge);
    const bound = assigned && assigned.operator === actor;
    const evidence = {
      actor: bound ? actor : "warforge://unknown",
      seat: assigned?.id ?? null,
      payload: {bridge: definition?.id ?? null, action: definition?.actions.includes(action) ? action : null}
    };
    const deny = reason => {
      this.record("DENIAL_RECEIPT", {...evidence, payload: {...evidence.payload, decision: reason}});
      return {ok: false, reason};
    };
    if (!bound) return deny("actor-seat-mismatch");
    const decision = this.#bridges.authorize(bridge, seat, action);
    if (!decision.ok) return deny(decision.reason);
    if (!assigned.permissions.actions.includes(action) || assigned.permissions.forbidden_actions?.includes(action)) {
      return deny("denied");
    }
    const handle = this.#handlers.get(bridge)?.get(action);
    if (typeof handle !== "function") return deny("unsupported-action");

    try {
      this.#guard?.({bridge, seat, actor, action});
      this.record("PERMISSION_RECEIPT", {...evidence, payload: {...evidence.payload, decision: "allowed"}});
      const result = handle(payload, {seat, actor});
      this.record("ACTION_RECEIPT", {...evidence, payload: {...evidence.payload, decision: "accepted"}});
      return {ok: true, result};
    } catch (error) {
      if (error instanceof ActionError) return deny(error.reason);
      this.record("ACTION_RECEIPT", {...evidence, payload: {...evidence.payload, decision: "failed"}});
      throw error;
    }
  }
}
