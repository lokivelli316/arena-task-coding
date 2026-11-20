import { validateManifest, visibleState, ReceiptLedger } from "./core.js";
import { BridgeRegistry } from "./bridge-registry.js";

export class WarforgeMatch {
  constructor(manifest){
    validateManifest(manifest);
    this.manifest=structuredClone(manifest);
    this.ledger=new ReceiptLedger();
    this.bridges=new BridgeRegistry();
    for(const b of manifest.bridges) this.bridges.register(b);
    this.state={};
  }
  setState(key, value, classification={class:"PUBLIC"}){
    this.state[key]={...classification,value};
  }
  view(seat,{judge=false}={}){ return visibleState(this.state,seat,judge); }
  request({bridge,seat,actor,action,payload={}}){
    const auth=this.bridges.authorize(bridge,seat,action);
    this.ledger.append({match_id:this.manifest.match_id,type:auth.ok?"ACTION_RECEIPT":"DENIAL_RECEIPT",actor,seat,payload:{bridge,action,payload,decision:auth}});
    return auth;
  }
}
