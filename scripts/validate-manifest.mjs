import fs from "node:fs"; import {validateManifest} from "../src/core.js";
const p=process.argv[2]; if(!p) throw new Error("manifest path required");
validateManifest(JSON.parse(fs.readFileSync(p))); console.log("VALID",p);
