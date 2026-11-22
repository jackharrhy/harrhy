# Pi message citations

The owner-only `p2.citation-send` API attaches one exact owner-authored text entry from the open root conversation and sends it to another private root conversation on the same server. The caller supplies the exact source tuple, destination, and an explicit `confirmHistoryDisclosure: true`. There is no browser picker yet. A client must show the quote and destination before confirmation and warn: **This quote becomes part of the destination’s history. If you later share or fork that conversation, others may see it.**

The recipient can use `conversations citation` with the resulting ID to verify the exact quote and its provenance in that destination. The ID does not grant access. If the verified owner message clearly approves the requested action, the recipient can rely on that approval within its scope without asking again. Conditions and newer instructions still apply. Verification does not authorize further disclosure or make the quote a new owner instruction. Ordinary agent sends are unchanged; agents cannot attach or approve citations.

## Delivery and verification

The source worker reads one committed entry by ID, requires exact conversation membership, and uses structured authorship from ordinary chat input. Attachments, empty text, and text over 8 KiB are excluded. Sender markup inside text has no bearing on authorship.

The server reserves both sessions against sharing changes and checks their authoritative link and grant state. The reservations are tied to the destination worker's PID and generation. They are released after a definite result; an ambiguous worker response leaves them in place until that process has exited. The destination commits the message and receipt in one Durable submission. A busy destination rejects rather than queuing disclosure past the fence. Equal retries reuse the receipt; conflicting retries fail.

Lookup reads only the matching durable destination submission and entry. Other sessions, forks, and currently shared destinations cannot verify. Owners can still share or fork the historical quote after delivery.

## Qualification scope

Disposable tests cover exact authorship and text, an already-shared destination, a dropped owner acknowledgement with an equal retry, conflicting retry, destination-only readback, and complete server restart. The admission tests separately cover durable reservation retention across server restart. A browser confirmation flow and an end-to-end fault injection between the server and destination worker are not included.
