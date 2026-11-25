# Security and authority boundary

A local host loads a trusted match manifest and repository, then assigns each
operator a channel bound to a seat and actor. `WarforgeMatch.request()` and
`CodingDeathmatch.openSeat()` are host interfaces. Authentication belongs to the
transport that calls them. The batch and interactive CLIs are host controls and
can route to every assigned seat. Send only the bound channel and its responses
to a participant.

The match checks actor assignment, the seat action allowlist and denylist, the
bridge grant, and the presence of a handler before dispatch. Coding policy also
enforces the seat's exact worktree scope, role eligibility, and adapter choice.
A designated judge can evaluate submissions. A permitted human operator or
referee can terminate a pending seat, and a permitted spectator can observe the
public projection. Spectators and competitors receive the published result.

State projections authorize judge data from the assigned seat role, return seat
data only to its owner, and exclude application-private fields. Values are
copied on input and output. The host archive is restricted to the host and may
record scoped metadata such as permitted paths, branch names, and seat
lifecycle. Archive and artifact directories use private filesystem permissions.
Share the appropriate projection with each seat.

Git owns commit identity and content. The broker creates one private Git
worktree and branch per seat. Provider channels expose scoped UTF-8 file
operations. They do not get host worktree paths, Git's common directory, or an
unrestricted terminal. Files with unsupported path names, symlinks or hard
links are rejected. The trusted source repository is administered by the host.
Git hooks, global configuration, filesystem monitors, and automatic
submodule recursion are disabled for broker commands. Configured executable
Git filters are rejected.

The terminal accepts only manifest-declared Node command IDs. Bubblewrap
starts its own Linux namespaces and supplies a read-only snapshot of permitted
files, temporary scratch, device files, the system library paths, and the Node
binary. Environment variables are explicitly supplied by the broker. The judge
assembles its snapshot from Git blobs at the submitted commit. Judge-only jobs
can perform trusted checks against submission files as data. If a judge job
executes a candidate inside its own interpreter, that candidate shares the
job's process context. Separate protected hidden-test fixtures and an isolated
candidate-vs-judge execution protocol are future work.

Receipts carry controlled metadata and fingerprints. Command output, arbitrary
request payloads and file contents are absent from receipts. The terminal
returns bounded output through the requesting seat's channel. The judge returns
scores, pass/fail and output fingerprints. Archive replay verifies the chain and
stored artifact bytes. Preserve a trusted tip separately to detect truncation
or replacement of a complete chain. Hashes supply tamper evidence and do not
authenticate claims.

Supported runtime limits are wall-clock command and match deadlines, seat
turns and elapsed time, scoped paths, file size, and command-output size.
This local reference relies on the host's administrative boundary. Remote
authentication, streaming durability,
resource quotas, concurrent worker isolation and secure external provider
execution are tracked in the build receipt.

### Signed Coding Deathmatch seats

A host can require a designated Ed25519 issuer for every seat by passing its
public KeyObject as `authorityPublicKey` to the CodingDeathmatch constructor.
This selects signed-only mode for the whole match. The trusted local mode
continues to use `openSeat` when the option is omitted.

```js
// The host has already authenticated the channel and loaded the issuer's public key.
const match = new CodingDeathmatch(manifest, {repository, output, authorityPublicKey});
const channel = match.openSignedSeat(seat, actor);

// On the designated issuer, using signAuthorityPacket from src/authority.js:
const packet = signAuthorityPacket(privateKey, channel.scope, "read",
  {path: "answer.txt"}, Date.now() + 30_000);

// On the seat-bound host channel, after transport:
const response = channel.invoke(packet);
```

The wire envelope contains a UTF-8 JSON message and a base64url Ed25519
signature over its exact bytes. The inner message follows
`protocol/authority-packet.schema.json`. It binds the protocol, a fresh match
instance, match ID, task hash, actor, seat, action, exact input, Unix expiry
in milliseconds, and issuer-generated nonce. Each host verifies its own scope
and consumes each valid nonce once before bridge dispatch. A denied operation
also spends its nonce. Receipts record the verified nonce or a denial reason.
The issuer keeps its private key and decides which operations to sign. Packets
are bearer credentials within their bound channel until used or expired.

Replay tracking lives in one match owner and lasts for that instance. New
instances reject earlier packets, including when the manifest and key are
reused. Remote identity, transport security, issuer key provisioning and
rotation, and coordination across independent host processes remain open.
