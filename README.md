# ASTRAMYTHOS DEATHMATCH

**Warforge operator address:** `warforge://operator/coder`

ASTRAMYTHOS DEATHMATCH is a generalized competitive/cooperative operator fabric. Warforge is the orchestration protocol: it coordinates operators, seats, bridges, scoped state, events, actions, judges, receipts, and results without replacing the native application that owns the match surface.

## Core invariant

> The native application remains authoritative for state it owns. Warforge coordinates access to that state through explicit bridge contracts and seat-scoped permissions.

Humans, models, agents, apps, tools, and services can participate as operators. A seat defines role and authority; identity alone grants nothing.

## First implementation: Coding Deathmatch

The first executable surface is a repository/workspace coding match.

- isolated coder seats
- equal or explicitly declared budgets
- repository/worktree isolation
- deterministic test-harness judge
- explicit tool/runtime permissions
- patch, commit, build, test, artifact, score, and result receipts
- replay/audit log
- operator participation as coder, judge, referee, spectator, or operator-of-operators

See `protocol/` for the machine-readable contract and `docs/` for the founding architecture.

## Run the local match

Use Linux with Git, Node.js 22 or later, npm, and Bubblewrap with unprivileged
user namespaces. The verification script installs the locked dependencies and
runs the tests, schema validation, and a disposable two-seat match.

```sh
./install.sh
WARFORGE_SMOKE_KEEP=1 npm run smoke
```

The smoke run starts a local agent seat and a human seat, submits two Git
commits, and runs the deterministic judge. Its output includes the result,
receipt tip, and archived evidence path. Keep the tip independently if you need
to detect replacement of the entire archive.

```sh
npm run coder -- replay /path/to/archive.json <trusted-receipt-tip>
```

For a trusted local repository, supply a match manifest, a new evidence
directory, and a JSON array of seat operations. The example manifest and plan
use a repository with a tracked `answer.txt` file. Give each run a fresh
`match_id` or use a disposable repository. Seat branches are retained for
inspection after their worktrees are removed.

```sh
npm run coder -- run examples/coding-deathmatch.json /path/to/repo /path/to/new-evidence examples/coding-deathmatch-plan.json
```

The trusted host can also drive seats interactively with one JSON request per
line. Each line supplies `seat`, `operation`, and an optional `input` object. Use
the `context` operation to obtain the task and permitted commands. At end of
input, the host saves evidence and removes the worktrees. Host applications can
instead give an individual participant the bound channel returned by
`CodingDeathmatch.openSeat()`.

See [the operator skill](skills/warforge-coder/SKILL.md) and [the security
boundary](docs/SECURITY.md).
