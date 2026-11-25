import { bridgeSchema, requireSchema } from "./schemas.js";

export class BridgeRegistry {
  #bridges = new Map();

  register(bridge) {
    requireSchema(bridgeSchema, bridge);
    if (this.#bridges.has(bridge.id)) throw new Error(`duplicate bridge ${bridge.id}`);
    this.#bridges.set(bridge.id, structuredClone(bridge));
  }

  get(id) {
    return structuredClone(this.#bridges.get(id));
  }

  list() {
    return structuredClone([...this.#bridges.values()]);
  }

  authorize(id, seat, action) {
    const bridge = this.#bridges.get(id);
    if (!bridge) return {ok: false, reason: "unsupported-bridge"};
    if (!bridge.actions.includes(action)) return {ok: false, reason: "unsupported-action"};
    const grant = Object.hasOwn(bridge.permissions, seat) && bridge.permissions[seat];
    return grant?.actions?.includes(action) ? {ok: true} : {ok: false, reason: "denied"};
  }
}
