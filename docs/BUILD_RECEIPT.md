# Warforge build receipt

## Baseline

- Repository `lokivelli316/arena-task-coding`, PR #1, branch `work/warforge-foundation-20261120`.
- Starting HEAD `f2f57351209388e3c109feebeadab926307bb09a`. PR base `df32ebc54f3a93d7cccc15a1122b84a742f6f2e1` on `main`.
- Reviewed all 20 tracked files and the PR diff of 17 files and 422 added lines. The preflight covered all four schemas, CI, installation and execution scripts, tests, the coder skill, authorization, state visibility, receipt-chain behavior, and the donor architecture map.
- The baseline shell was Linux with Node `v24.22.3`, npm `11.19.1`, and Bubblewrap `0.12.0`.

| Exact baseline command | Exit | Result |
| --- | ---: | --- |
| `npm test` | 0 | PASS. Three tests passed. |
| `npm run validate` | 0 | PASS. The original validator accepted the example. |
| `npm run smoke` | 0 | PASS. The smoke checked two authorization receipts and visibility, without executing Git or the judge. |
| `bash install.sh` | 0 | PASS. It repeated the three baseline checks. |
| `./install.sh` | 126 | FAIL. The tracked script had mode `100644`. |
| `gh pr checks 1 --repo lokivelli316/arena-task-coding` | 0 | PASS. Both protocol checks passed. CodeRabbit was skipped. |
| `bwrap --unshare-all --ro-bind /usr /usr -- /usr/bin/true` | — | FAIL. The initial environment probe omitted the loader. It ran inside a composite shell command whose final exit was 0. |
| `bwrap --unshare-all --die-with-parent --ro-bind /usr /usr --symlink usr/lib /lib --symlink usr/lib64 /lib64 -- /usr/bin/true` | 0 | PASS. The amended namespace probe ran successfully. |
| `codex --version` | 0 | PASS. Codex CLI `0.172.0-alpha.2` was present. Provider credentials and execution were unverified. |

Inspection found identity-independent authorization, a caller-selected judge
view, mutable state and receipt payload aliases, receipt/schema disagreement,
input validation that bypassed the schemas, authorization-only bridge
responses, and an unbounded judge with inherited environment and raw logs.
Regression tests reproduced the applicable gaps before implementation. The
original tests were preserved.

## Commits and file inventory

- `c144a4be691c1faa5c3b3785b69c3d3e2d74688c` adds the executable reference match. It was pushed to the branch backing PR #1.
- The handoff commit adds this receipt and links it from the README. Retrieve its identity with `git log -1 --format=%H -- docs/BUILD_RECEIPT.md`.

| File | Change and purpose |
| --- | --- |
| `.github/workflows/ci.yml` | Modified. Installs Bubblewrap, prepares user namespaces on the Ubuntu runner if required, and checks the lockfile-based installation on Node 22. |
| `.gitignore` | Added. Ignores local dependencies and runtime evidence. |
| `README.md` | Modified. Documents local match execution, entry points, replay, and handoff. |
| `docs/SECURITY.md` | Modified. Describes authentication ownership, seat channels, file and command boundaries, judging, and archive trust. |
| `docs/BUILD_RECEIPT.md` | Added. Records baseline, changes, evidence, and HOLD items. |
| `examples/coding-deathmatch.json` | Modified. Configures two coder seats, an intervening human operator, a deterministic judge, four implemented bridges, and an exact fixture acceptance check. |
| `examples/coding-deathmatch-plan.json` | Added. Drives two competing submissions and includes an expected cross-seat traversal denial. |
| `install.sh` | Modified. Restores direct execution and verifies the locked install and runtime. |
| `package.json` | Modified. Registers the coder command, requires Node 22 or later, and lists schema dependencies. |
| `package-lock.json` | Added. Pins schema validation dependencies. |
| `protocol/bridge-manifest.schema.json` | Modified. Validates permission entries, receipt types, and bridge contract fields. |
| `protocol/coding-policy.schema.json` | Added. Defines supported task, scope, check, scorer, lifecycle and local runtime settings. |
| `protocol/event.schema.json` | Modified. Requires a seat for seat-private events. |
| `protocol/match-manifest.schema.json` | Modified. References the bridge and coding schemas and defines action, seat, and adapter fields. |
| `protocol/receipt.schema.json` | Modified. Validates actual ledger entries, including chain and payload digests. |
| `scripts/coder.mjs` | Added. Routes the canonical coder address through batch and interactive host controls and independently verifies replay. |
| `scripts/create-seat-worktree.sh` | Modified. Delegates to the validated helper and supports direct invocation. |
| `scripts/create-seat-worktree.mjs` | Added. Creates the standalone private seat worktree and emits its Git base and branch. |
| `scripts/judge.mjs` | Modified. Uses the bounded runtime and emits a ledger receipt with output hashes. |
| `scripts/smoke.mjs` | Modified. Executes the coder CLI against a disposable Git repository, replays the result and verifies artifacts. |
| `skills/warforge-coder/SKILL.md` | Modified. Documents executable operations and provider activation requirements. |
| `src/bridge-registry.js` | Modified. Validates registrations, rejects duplicates and protects registry configuration from caller mutation. |
| `src/coder-adapter.js` | Added. Defines the bound channel and normalized operations for local and human adapters. |
| `src/coding-match.js` | Added. Routes real coding, terminal, judgment, artifact, lifecycle and scoring operations through Warforge. |
| `src/core.js` | Modified. Enforces schema and reference constraints, classifies state, and verifies receipt chains. |
| `src/match.js` | Modified. Binds actor to assigned seat and intersects grants before dispatching a real handler. |
| `src/replay.js` | Added. Reconstructs seat, submission, judgment and result evidence and verifies the archive header and artifacts. |
| `src/sandbox.js` | Added. Runs approved Node commands inside Bubblewrap over a bounded, read-only file snapshot. |
| `src/schemas.js` | Added. Compiles Warforge schemas with JSON Schema 2020-12 validation. |
| `src/worktrees.js` | Added. Manages private worktrees and scoped files and reads immutable commit blobs for judging. |
| `test/coding-deathmatch.test.js` | Added. Exercises multi-seat, file, runtime, judge, replay, lifecycle, helper and budget behavior on real disposable repositories. |
| `test/protocol-boundaries.test.js` | Added. Exercises malformed manifests, registration, authorization, all state views, and receipt tampering. |

No files were deleted. The donor architecture map remains a reference;
third-party donor source and runtimes were neither imported nor activated.

## Test and execution evidence

| Exact command | Exit | Result |
| --- | ---: | --- |
| `node --test test/protocol-boundaries.test.js` | 1 → 1 → 0 | FAIL on all five new protocol tests against the baseline. A missing-grant handler bug remained on the first repair pass. The next pass passed all five. |
| `node --test test/coding-deathmatch.test.js` | 1 → 1 → 0 | FAIL for missing runtime modules initially, then for fixture teardown order. The first four runtime cases passed after teardown repair. |
| `node --test test/coding-deathmatch.test.js` | 1 | FAIL on ignored files influencing the judge and unchecked worktree scope. Both passed with the subsequent full test run. |
| `node --test test/coding-deathmatch.test.js` | 1 | FAIL on unregistered provider substitution. The next install run passed this regression. |
| `node --test test/coding-deathmatch.test.js` | 1 → 0 | FAIL on the missing observer action. The final focused run passed 12 tests, including deadline, helper and standalone judge checks. |
| `npm install --save-exact ajv@8.20.0 ajv-formats@3.0.1` | 0 | PASS. Six packages installed. |
| `npm install --package-lock-only` | 0 | PASS. Synchronized the runtime requirement into the lockfile. |
| `node --input-type=module -e 'import {checkSandbox} from "./src/sandbox.js"; checkSandbox()'` | 1 → 0 | FAIL before specifying the explicit user namespace flag. PASS after remediation. |
| `npm test` | 0 | PASS during implementation at 14 and 19 tests. The final Node 22 install repeated it with 20 tests. |
| `npm run validate` | 0 | PASS using the compiled match, bridge, and coding-policy schemas. |
| `npm run smoke` | 0 | PASS on the first two-seat CLI run and subsequent install runs. |
| `npm run coder -- --help` | 0 | PASS. Advertised the canonical address and the run, interactive and replay entry points. |
| `./install.sh` | 0 | PASS with 17 tests on Node 24 during development. |
| `npx --yes --package node@22 -c './install.sh'` | 0 | PASS on Node `v22.23.5`. Clean `npm ci`, 20 tests passed, manifest valid, smoke produced 47 receipts and three verified artifacts. |
| `git diff --check && bash -n install.sh scripts/create-seat-worktree.sh` | 0 | PASS. Patch whitespace and shell syntax. |
| `rg --files src scripts test -g '*.js' -g '*.mjs' \| xargs -n1 node --check` | 0 | PASS. JavaScript syntax. |
| `WARFORGE_SMOKE_KEEP=1 npm run smoke` | 0 | PASS. Preserved one local 47-receipt archive and all three stored artifacts. |
| `npm run coder -- replay /tmp/warforge-smoke-cSHoyw/evidence/archive.json 7a95b22c18b312a63f4c834b231858edd6ae4f0ac89b36933c1dd21ffa750f33` | 0 | PASS. Rebuilt Alpha 10, Bravo 1 and verified both patches and the stored answer. |
| `gh pr checks 1 --repo lokivelli316/arena-task-coding` | 8 → 0 | PENDING during queueing. PASS after both hosted protocol jobs completed for the implementation commit. CodeRabbit was skipped. |
| `gh run view 44839632978 --repo lokivelli316/arena-task-coding --json headSha,event,conclusion,jobs` | 0 | PASS. The pull request run succeeded for `c144a4b`, including Bubblewrap setup and `./install.sh`. |
| `gh run view 44839627102 --repo lokivelli316/arena-task-coding --json headSha,event,conclusion,jobs` | 0 | PASS. The push run succeeded for `c144a4b`, including Bubblewrap setup and `./install.sh`. |

The retained smoke evidence is available in the session workspace at
`/workspace/scratch/warforge-smoke-20261120/archive.json`. To regenerate it on
another checkout, run `WARFORGE_SMOKE_KEEP=1 npm run smoke` and keep the
reported tip separately.

- Alpha commit `7b243e48ba96de8d98aedd74f3b135c4b8981847`. Patch SHA-256 `928a6145a66152acaecce164a7fe8f1832c4b4fdf80b6a502af6513daca368cc`.
- Bravo commit `2d4b3d7d60dd255515f550f51069fe20a8c97071`. Patch SHA-256 `53bfd5b2e8b989cdef868f1b8e79570f5f35ccace8d7f70b0a95fd33abee2173`.
- Alpha's acceptance check passed and Bravo's acceptance check failed. The base repository stayed unchanged. The generated Git commit IDs come from this disposable fixture.

## Implementation matrix

The scope in the first column applies to every status in its row. Each column
reports its own condition. Verified requires a direct behavior test. “—” means
a separate registration step does not apply.

| Capability | Present | Registered | Configured | Wired | Runnable | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| Match engine | Yes | — | Yes | Yes | Yes | Yes |
| Operator model and roster | Yes | Yes | Yes | Yes | Yes | Yes |
| Seat permissions | Yes | Yes | Yes | Yes | Yes | Yes |
| State isolation through bound views and commands | Yes | Yes | Yes | Yes | Yes | Yes |
| Bridge registry | Yes | Yes | Yes | Yes | Yes | Yes |
| GitHub bridge, local Git operations | Yes | Yes | Yes | Yes | Yes | Yes |
| GitHub bridge, hosted API operations | No | No | No | No | No | No |
| Terminal bridge, approved Node command IDs | Yes | Yes | Yes | Yes | Yes | Yes |
| Test-harness bridge | Yes | Yes | Yes | Yes | Yes | Yes |
| Coder adapter interface | Yes | Yes | Yes | Yes | Yes | Yes |
| Worktree isolation through broker and sandbox | Yes | — | Yes | Yes | Yes | Yes |
| Deterministic judge, committed snapshot and artifact checks | Yes | Yes | Yes | Yes | Yes | Yes |
| Receipt chain | Yes | — | Yes | Yes | Yes | Yes |
| Artifact hashing | Yes | — | Yes | Yes | Yes | Yes |
| Scoring and result | Yes | — | Yes | Yes | Yes | Yes |
| Replay and artifact verification | Yes | — | Yes | Yes | Yes | Yes |
| Budgets and timeouts, turns and wall time | Yes | — | Yes | Yes | Yes | Yes |
| Disconnect and rejoin within one live host | Yes | Yes | Yes | Yes | Yes | Yes |
| Human operator, coder and authorized intervention/observation | Yes | Yes | Yes | Yes | Yes | Yes |
| Codex adapter | No | No | No | No | No | No |
| Additional coder adapters, built-in local and human | Yes | Yes | Yes | Yes | Yes | Yes |
| Additional external coder adapters | No | No | No | No | No | No |

## HOLD and next handoff

- **Remote identity and authority.** Channel factories assume an authenticated host. CodingDeathmatch now supports a designated Ed25519 issuer, expiring one-use packets and signed-only seat dispatch (see SECURITY.md). Transport authentication and persistent seat rejoin across host restart remain open. No privileged remote authority is active.
- **External coder providers.** The local and human channels are wired. Codex CLI presence was checked, while Codex API/session access and secure credential delivery to an isolated provider remained unverified. Codex, OpenCode, Claude Code, Gemini, and other external integrations require provider adapters and end-to-end tests.
- **GitHub remote operations.** The GitHub bridge uses local Git and advertises its real operations. Hosted GitHub authentication, fetch/sync, PR publication, and GitHub-event verification remain open. The repository update for this task used the workspace's existing Git transport separately from the match.
- **Runtime and resources.** This is a Linux/Bubblewrap reference for one allowlisted Node tool and bounded text edits. General command/tool backends, file deletion and managed binary edits, CPU/memory/PID/disk/network quotas, token accounting, hard cancellation of Git/filesystem operations, concurrent isolated workers, and managed secrets remain open. The trusted host controls the source and evidence directories.
- **Hidden tests and independent judging.** Protected hidden fixtures during candidate execution require a separate candidate-vs-judge boundary. The reference supports judge-only commands and safe checks that treat submission files as data. Human and model subjective scoring layers are unimplemented.
- **Transport and persistence.** A trusted host can multiplex seats or hand one seat a bound channel. There is no remotely authenticated multi-client interface, independent event stream, or recovery journal for interrupted execution. Replay reconstructs evidence and verifies the archive, without rerunning the score or restoring live matches. Archive replacement protection depends on a trusted tip retained separately.
- **Policy breadth.** Human intervention covers an explicit termination grant and public observation. Operator replacement, general intervention and adjudication policies, and additional budget and tie-break strategies remain open.
- **Production status.** The verified result is a local reference match. Shared-host adversarial deployment, human identity verification, remote services, provider integrations and production readiness remain uncertified.

A subsequent engineer can run the retained example, review archived receipts and
patches, and start from the bound channel in `src/coder-adapter.js`, the governed
handler routing in `src/coding-match.js`, and the runtime boundary in
`src/sandbox.js`. The PR remains open for review.

[Pull request #1](https://github.com/lokivelli316/arena-task-coding/pull/1) ·
[Implementation push check](https://github.com/lokivelli316/arena-task-coding/actions/runs/44839627102) ·
[Implementation pull request check](https://github.com/lokivelli316/arena-task-coding/actions/runs/44839632978)
