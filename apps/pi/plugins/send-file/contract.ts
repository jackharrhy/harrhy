/** The `ref` of the downloads conversation `conversation` offered (`send_file`), in the session's files. */
export function offeredBy(conversation: number): string {
	return `conversation:${conversation}`;
}
