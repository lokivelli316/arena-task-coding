import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorktree, repositoryBase } from "../src/worktrees.js";

const [, , match, seat, ref] = process.argv;
if (!match || !seat || process.argv.length > 5) {
  console.error("usage: create-seat-worktree.sh <match-id> <seat-id> [base-ref]");
  process.exit(2);
}

const {root, base} = repositoryBase(".", ref);
const parent = mkdtempSync(join(tmpdir(), "warforge-seat-"));
try {
  console.log(JSON.stringify({match_id: match, seat_id: seat, ...createWorktree(root, parent, match, seat, base)}));
} catch (error) {
  rmSync(parent, {recursive: true, force: true});
  console.error(error.message);
  process.exitCode = 1;
}
