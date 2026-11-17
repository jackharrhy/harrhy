// The sidebar's relative-age formatter and minute clock, shared with other native metadata rows.
import { useEffect, useState } from "react";

/** The current time, again every minute while the sidebar or a metadata pane is shown. */
export function useNow(): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/** How long ago `time` was, in the sidebar's short form. */
export function ago(time: number, now: number): string {
	const seconds = Math.max(0, (now - time) / 1000);
	if (seconds < 60) return "now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
	return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
