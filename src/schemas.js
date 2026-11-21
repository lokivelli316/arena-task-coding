import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import authority from "../protocol/authority-packet.schema.json" with {type: "json"};
import bridge from "../protocol/bridge-manifest.schema.json" with {type: "json"};
import coding from "../protocol/coding-policy.schema.json" with {type: "json"};
import match from "../protocol/match-manifest.schema.json" with {type: "json"};
import receipt from "../protocol/receipt.schema.json" with {type: "json"};

const ajv = new Ajv2020({allErrors: true, ownProperties: true});
addFormats(ajv);

export const authoritySchema = ajv.compile(authority);
export const bridgeSchema = ajv.compile(bridge);
export const receiptSchema = ajv.compile(receipt);
ajv.addSchema(coding);
export const matchSchema = ajv.compile(match);

export function requireSchema(schema, input) {
  if (schema(input)) return;
  const error = schema.errors[0];
  throw new Error(`invalid schema at ${error.instancePath || "/"}: ${error.message}`);
}
