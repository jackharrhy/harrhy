# Peers

A trusted plugin that links this Pi to another Pi over SSH, so an agent on one can message a session on the other. Both
owners approve in their own Settings; nothing is configured in a file.

## How it works

- Each Pi writes `<XDG_STATE_HOME or ~/.local/state>/pi-peers/<instanceId>.json` (name, port) while it runs.
- In **Settings › Peers** the owner enters an SSH login (`user@host`) and presses Find. Pi runs `ssh` with `BatchMode` and
  strict host-key checking, reads that directory, and lists the Pis it finds. The login must already work without a
  password, and its host key must already be known (connect once from a terminal).
- Request link opens one long-lived `ssh -N -L … -R …` connection. The forward reaches the peer's loopback Pi; the reverse
  forward lets the peer call back. The Pi that asked owns that connection and reconnects with backoff.
- The other owner sees the request in its Settings › Peers and approves or denies. The asker is trusted by having asked.
  On approval each side stores a random 256-bit credential for calls to the other (`<data>/peers-secrets.json`, 0600).
- After that, messages travel in-band: `/peer/v1/*` on loopback, bearer credential plus `X-Pi-Peer`, accepted only from a
  direct loopback client (no proxy headers, cookies or Fetch Metadata), like [local-inbox](../../../../docs/pi-inbox.md).

## Policy and delivery

What a peer may reach is the owner's choice per peer: nothing, the Familiar only (default), or every private session. It
is applied through the addressed-stimuli policy (`AddressedPolicies`), so the receiving session sees the message as
external input from the peer, with the usual event ID, receipt and conflict rules. Removing a peer on either side ends
the link on both.

## Agent tools

`peer_list`, `peer_targets`, `peer_send` (idempotent per tool call) and `peer_receipt`. A reply is a message the other
agent sends back; it is not the result of `peer_send`.

## Installation

Install this directory as a real directory in `<P2_DATA_DIR>/plugins/peers/` on a Pi build that has it, and follow the
operator window of [the integrations guide](../README.md). It adds routes under `/peer/v1` on the loopback listener only.

Both Pis need the plugin. Tests use `P2_PEERS_SSH` to replace the `ssh` binary (`__tests__/fixtures/fake-ssh.mjs`).
