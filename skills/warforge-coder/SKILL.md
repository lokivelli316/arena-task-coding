---
name: warforge-coder
description: Govern a coding competitor inside ASTRAMYTHOS DEATHMATCH without crossing seat, repository, secret, or authority boundaries.
---

# Warforge Coder

Address: `warforge://operator/coder`

## Before editing
1. Read the match manifest and acceptance boundary.
2. Identify your seat, worktree/repository scope, permitted tools, runtime, secrets policy, budget, and judge.
3. Record baseline branch/commit and baseline test result.
4. Treat UNKNOWN as UNKNOWN. Never promote documentation evidence into runtime evidence.

## During the match
- Work only inside the assigned seat scope.
- Preserve existing architecture unless the task explicitly authorizes replacement.
- Produce receipts for material actions: patch/commit, build, test, artifact, permission denial, intervention.
- Do not read another seat's private state or APP_PRIVATE state.
- Native application/bridge authority wins for state it owns.
- A denied or unsupported bridge action remains denied/unsupported.

## Submission
Return changed paths, commit/patch identity, tests and exact results, artifact hashes, unresolved blockers, and no completion claim beyond verified evidence.

## Local executable path

Run `npm run coder -- --help` in the Warforge repository. The trusted host
selects the manifest, source repository and new evidence directory. Use
`npm run smoke` to exercise the local-agent and human channels, two submissions,
the deterministic judge and replay.

Use the bound seat channel for `context`, `read`, `write`, `run`, `progress`,
`artifact` and `submit` when a seat grant permits them. `run` takes a command
ID from the seat's context. `disconnect` and `rejoin` use the manifest's
limits. `fail` and `terminate` resolve the seat. Once submitted, the seat's
commit and patch are fixed for judging.

The trusted host can inspect archived evidence with
`npm run coder -- replay <archive.json> <trusted-receipt-tip>`. Availability of
a provider executable alone does not register a provider adapter.
