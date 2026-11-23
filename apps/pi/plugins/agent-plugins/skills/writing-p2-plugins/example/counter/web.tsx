// The counter's sheet: a command of the command menu opens it, and the `overlay:counter` slot renders it while it is
// the top layer.
import { BACKGROUND_CONTEXT, contribute, defineFacet, liveIn } from "@p2/app/v1";
import {
	type Command,
	Commands,
	closeLayers,
	openLayer,
	Sheet,
	Slots,
	useCanWrite,
	useObject,
	useReadable,
	useRoute,
	useSheet,
	useStatus,
} from "@p2/app/v1/web";
import { useEffect, useState } from "react";
import { Counter } from "./contract.ts";

function CounterPane({ session }: { session: string }) {
	const editable = useCanWrite(session);
	const ref = useObject(Counter, { session });
	useStatus(ref);
	const board = liveIn(ref, "player");
	const count = useReadable(board?.count);
	const present = useReadable(board?.present) ?? [];
	const [wave, setWave] = useState("");
	useEffect(() => {
		if (!board) return;
		let stopped = false;
		let stop = () => {
			stopped = true;
		};
		void board.waved
			.on(({ value }) => setWave(`${value.from} waved`), BACKGROUND_CONTEXT)
			.then((subscription) => {
				if (stopped) subscription.stop();
				else stop = () => subscription.stop();
			});
		return () => stop();
	}, [board]);
	return (
		<div>
			<p className="counter-count">{count ?? "…"}</p>
			<p className="muted">Here: {present.join(", ")}</p>
			{editable && board && (
				<p>
					<button type="button" onClick={() => void board.add({ by: 1 }, BACKGROUND_CONTEXT)}>
						+1
					</button>{" "}
					<button type="button" onClick={() => void board.wave(BACKGROUND_CONTEXT)}>
						Wave
					</button>
				</p>
			)}
			<p className="muted">{wave}</p>
		</div>
	);
}

/** The sheet, while it is the top layer in a session. */
function CounterSheet() {
	const { session } = useRoute();
	if (useSheet("counter") === undefined || session === undefined) return null;
	return (
		<Sheet title="Counter" onClose={closeLayers}>
			<CounterPane session={session} />
		</Sheet>
	);
}

const COMMANDS: Readonly<Record<string, Command>> = {
	"counter.open": {
		title: "Counter",
		group: "Counter",
		order: 50,
		target: ["session"],
		action: { kind: "run", run: () => openLayer({ kind: "sheet", name: "counter" }) },
	},
};

export default defineFacet((host) => {
	contribute(host, "counter.web", (self) => {
		self.contribute(Slots, { "overlay:counter": CounterSheet });
		self.contribute(Commands, COMMANDS);
	});
});
