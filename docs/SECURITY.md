# Security and authority boundary

Warforge's security model is capability-bound, not prompt-bound.

- Seat identity never implies permission.
- `APP_PRIVATE` data is not returned by Warforge views.
- `SEAT_PRIVATE` data is returned only to the owning seat.
- Bridge actions must be both advertised and explicitly granted to the requesting seat.
- Unsupported and denied actions generate denial evidence.
- Secrets belong outside match manifests and receipts. Receipts may contain fingerprints/hashes, never secret values.
- Native applications remain authoritative for native hidden state.
- Repository coder seats use independent branches/worktrees.
- Deterministic judge commands receive an explicit working directory and argv; the reference harness does not accept browser-originated arbitrary shell strings.
- Future remote authority packets must bind match, task hash, seat, capabilities, expiry and nonce and must be signed by the designated authority before privileged execution.

## Threats explicitly in scope

Cross-seat state leakage, unauthorized bridge actions, hidden-state leakage, receipt tampering, accidental shared-worktree writes, false health/completion claims, replay ambiguity, and operator/model role confusion.
