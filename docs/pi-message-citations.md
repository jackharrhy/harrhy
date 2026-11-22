# Pi message citations

Ask in ordinary chat, for example: “Could you let Numbers Review know they can use these figures in the private review?” The agent resolves the recipient from context and the session list. It asks if the recipient is genuinely unclear, and sends nothing for advice or drafting alone. On a handoff, it can opt in to attach the exact current owner input using `conversations send`. Attach only when the exact words help and the whole message is appropriate to disclose. If it contains a private aside, relay only the appropriate part without a citation. No special wording, session ID from the owner, or extra confirmation is needed.

A citation becomes part of the destination's history. If the owner later shares or forks the destination, others may see the quote. The web transcript renders it as plain text. A connected owner can select **Show source message** to open the exact entry, even after the source switches its main conversation. A guest reading the historical quote gets no source link or source access.

## What verification means

The agent interprets intent, audience and whether the whole message can be shared. The server does not infer these from prose. In particular, if the sending agent mistakes advice for a send request, chooses the wrong private session, or misses a private aside, the runtime cannot distinguish that opt-in from a legitimate one. Enforcing intent or recipient consent mechanically would require a separate owner action or structured input.

The runtime checks that the current conversation tool call is acting on one committed ordinary owner input in the source root conversation. It reads structured authorship and text, not sender markup, tool-supplied quote text or arbitrary history. Guest, peer and non-chat inputs cannot supply an owner quote. Multiple inputs in the same run, attachments, blank text and text over 8 KiB are ineligible.

`conversations citation` verifies authorship and exact words in the destination, not the sender's interpretation or any broader authorization. If the verified words clearly approve the requested action, the recipient can rely on them within that scope, subject to conditions and newer instructions. A pasted quote or receipt is not proof and a receipt grants no access. Lookup requires the original destination's durable submission and entry; copies in forks and currently shared destinations cannot verify.

## Delivery

Cited sends use the existing conversation tool and fenced citation admission. Both live sessions must be unarchived and private, without a share link or active guest grant. Reservations block conflicting changes and are tied to the destination worker PID and generation. The destination waits for worker readiness when cold, rejects when busy rather than queuing disclosure, and commits the message and receipt in one Durable submission. Equal retries for the same input and destination reuse the receipt; changed content for that pair conflicts. An ambiguous worker response retains the reservations until that process exits. A failed cited send does not silently become an uncited send. Ordinary sends are unchanged.

## Qualification scope

Disposable tests drive ordinary owner chat through a loopback model fixture, the real conversation tool, and recipient verification. They cover hot and cold delivery, exact text and attribution, retry and conflict, sharing fences, guest and peer inputs, oversized text, advice and a private aside, and verification after server restart. The browser test covers literal quote rendering, an older entry outside the initial window after a main switch, Back, and guest source-access refusal. Admission tests separately exercise persisted reservations, including recovery across server restart. These tests do not measure natural-language intent accuracy or inject an ambiguous server-to-destination acknowledgement.
