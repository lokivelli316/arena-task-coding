import test from "node:test";
import assert from "node:assert/strict";
import { visibleState, ReceiptLedger, validateManifest } from "../src/core.js";
import manifest from "../examples/coding-deathmatch.json" with { type:"json" };

test("example manifest validates",()=>assert.equal(validateManifest(manifest),true));
test("private state never crosses seats",()=>{
 const state={pub:{class:"PUBLIC",value:1},a:{class:"SEAT_PRIVATE",seat:"alpha",value:"A"},b:{class:"SEAT_PRIVATE",seat:"bravo",value:"B"},secret:{class:"APP_PRIVATE",value:"NO"}};
 assert.deepEqual(visibleState(state,"alpha"),{pub:1,a:"A"});
 assert.deepEqual(visibleState(state,"bravo"),{pub:1,b:"B"});
});
test("receipt chain detects integrity",()=>{
 const l=new ReceiptLedger();
 l.append({match_id:"m",type:"ACTION_RECEIPT",actor:"a",seat:"s",payload:{x:1}});
 l.append({match_id:"m",type:"TEST_RECEIPT",actor:"j",seat:"judge",payload:{pass:true}});
 assert.equal(l.verify(),true);
});
