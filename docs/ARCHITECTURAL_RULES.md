# Architectural rules

1. Existing applications are wrapped before replacement is considered.
2. The native application remains authoritative for state it owns unless the bridge contract explicitly delegates authority.
3. Operator is a universal actor type: human, model, agent, app, tool, or service.
4. Seats define role and permissions; identity alone does not grant authority.
5. Hidden information is enforced by data boundaries.
6. Warforge does not expose unauthorized native state.
7. Every action material to scoring, security, audit, or replay produces a receipt.
8. Plug-ins translate; they do not silently rewrite native rules.
9. Bridges advertise only capabilities they actually support.
10. Human intervention is part of the protocol when the match allows it.
11. Matches may be competitive, cooperative, adversarial, or mixed.
12. The same orchestration layer must work across coding, games, simulations, documents, creative tools, and other existing apps.

## Coding Deathmatch invariant

`warforge://operator/coder` is the canonical coder operator address. Coding seats must declare repository/file scope, permitted tools, runtime, secrets policy, budget, build/test commands, intervention policy, and scoring rules. Deterministic tests are authoritative when the match manifest declares a deterministic test-harness judge.
