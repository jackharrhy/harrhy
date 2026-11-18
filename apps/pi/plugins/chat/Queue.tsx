// A bounded queue above the composer; its rows scroll without taking over the transcript.
import type { ReactNode } from "react";
import "./queue.css";

/** Keeps queued inputs reachable while reserving most of the viewport for the conversation. */
export function Queue({ count, children }: { count: number; children: ReactNode }) {
	return (
		<details className="chat-queue" open>
			<summary>{count} queued</summary>
			<section className="queued" aria-label="Queued messages">
				{children}
			</section>
		</details>
	);
}
