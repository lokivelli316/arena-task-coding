export class BridgeRegistry {
  #bridges = new Map();
  register(bridge) {
    for (const key of ["id","version","capabilities","actions","events","state_classes"]) {
      if (bridge[key] == null) throw new Error(`bridge missing ${key}`);
    }
    if (this.#bridges.has(bridge.id)) throw new Error(`duplicate bridge ${bridge.id}`);
    this.#bridges.set(bridge.id, structuredClone(bridge));
  }
  get(id){ return this.#bridges.get(id); }
  list(){ return [...this.#bridges.values()]; }
  authorize(id, seat, action) {
    const b=this.get(id);
    if(!b) return {ok:false,reason:"unsupported-bridge"};
    if(!b.actions.includes(action)) return {ok:false,reason:"unsupported-action"};
    const allowed=b.permissions?.[seat]?.actions ?? [];
    return allowed.includes(action) ? {ok:true} : {ok:false,reason:"denied"};
  }
}
