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
