# External peer ingress v1

Optional `ingress` plugin on p2's existing HTTP server. Without `<P2_DATA_DIR>/ingress.json`, requests return 404.
Initial deployment is local-only: no relay, proxy or browser requests. No new listener or owner principal.

This is **trusted internal coordination**, not an untrusted webhook sandbox. Sending to the Familiar indirectly
permits its existing agent tools. External messages are labeled `external`, not owner instructions or local sessions.
The existing Hermes gateway remains the return route; receipts and model answers are not automatically forwarded.

## Configuration

Write `ingress.json` privately (0600), using one dedicated random bearer credential, never the owner key:

```json
{
  "sender": "hermes",
  "name": "Hermes nano",
  "session": "<the EXISTING Familiar session UUID>",
  "tokenHash": "<lowercase SHA-256 hex of the bearer token>"
}
```

The server reads configuration per request. Removing it disables ingress; replacing the hash rotates the token.
Keep the sender ID and target stable across rotation: deduplication belongs to that sender and session. Do not retarget
an established sender namespace. The configured session must be the existing, unarchived Familiar; ingress never
creates, opens or restores it. Revocation does not undo already admitted work; an authorized in-flight request may commit.

## HTTP

Both operations require `Authorization: Bearer <dedicated token>`. Cookies do not substitute for it. The token grants
neither `/chord` access nor transcript, shell, stop, creation or owner APIs. No client-supplied sender or target.

- `POST /api/ingress/v1/events`, JSON `{ "eventId": "stable-id", "text": "message" }`.
- `GET /api/ingress/v1/receipts/stable-id` reads the same sender's admission receipt only.

Event IDs: 1–128 ASCII letters, digits, `. _ : -`. Text: nonempty, at most 32 KiB UTF-8; JSON body at most 64 KiB.
The envelope is closed. Text strings are preserved, not normalized. Content hash is SHA-256 of UTF-8 text.

Success is HTTP 200 with `{ "state": "admitted", "eventId", "contentHash", "submissionId" }`, only after Durable
commits both the receipt and native `followUp` admission. Equal concurrent/restarted retries return the same receipt;
a reused ID with changed text returns 409. No second queue, dispatcher, expiry or scheduling policy.

`admitted` does **not** mean read, answered, agreed or completed. Stop may withdraw queued input; its receipt stays,
and retrying does not resurrect it. An absent receipt (404) is a point-in-time read, not proof concurrent admission
cannot finish. Timeout, lost reply and 5xx mean outcome unknown: retry the **same ID and identical text**. This is not
an exactly-once guarantee for external tool effects or for restoring an older data backup.

401: missing/wrong credential. 403: nonlocal transport. 400/413: invalid/oversized input. 503: unavailable target,
configuration or unknown admission outcome. Secrets and content are not logged by this plugin.

## Portable client

`scripts/ingress.py` needs only Python's standard library, no checkout imports. Copy it anywhere. Keep the raw token
in a private file (0600); pass its path, never its value on the command line:

```sh
python3 ingress.py migration-review --token-file /private/hermes-ingress-token --text 'Review the migration evidence'
printf '%s' 'Review the migration evidence' | python3 ingress.py migration-review --token-file /private/hermes-ingress-token
python3 ingress.py migration-review --token-file /private/hermes-ingress-token --file /private/message.md
python3 ingress.py migration-review --token-file /private/hermes-ingress-token --receipt
```

Default URL: `http://127.0.0.1:8788`; `--url` overrides it. `P2_INGRESS_TOKEN_FILE` supplies the token path too.
The client refuses all redirects, so it never forwards the bearer to a redirect target. It accepts only HTTP 200
with a valid admitted receipt for the requested event ID; sends also verify the hash against the submitted text.
Receipt-only reads validate the hash format but cannot compare it to text not supplied to that command.
Do not retire an existing return helper until a substantive bidirectional canary verifies its replacement.
