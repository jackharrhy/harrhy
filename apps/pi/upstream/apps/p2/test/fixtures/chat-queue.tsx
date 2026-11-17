// Isolated queue in the chat's floating dock, with enough history to scroll independently.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Queue } from "../../plugins/chat/Queue.tsx";

function Fixture() {
	const [items, setItems] = useState(Array.from({ length: 19 }, (_, index) => index + 1));
	return (
		<div className="chat" style={{ position: "fixed", inset: 0 }}>
			<div className="scroller transcript">
				{Array.from({ length: 80 }, (_, index) => `Transcript message ${index}`).map((text) => (
					<p key={text}>{text}</p>
				))}
			</div>
			<div className="dock">
				<div className="composer-wrap">
					{items.length > 0 && (
						<Queue count={items.length}>
							{items.map((id) => (
								<div key={id}>
									<button
										type="button"
										className="queue-edit"
										onClick={() => {
											document.querySelector("textarea")!.value = `Message ${id}`;
											setItems((current) => current.filter((item) => item !== id));
										}}
									>
										<span>{id % 2 ? "Steer" : "Queued"}</span> Message {id} {"long text ".repeat(30)}
									</button>
									<button
										type="button"
										className="queue-remove"
										aria-label="Remove from queue"
										onClick={() => setItems((current) => current.filter((item) => item !== id))}
									>
										×
									</button>
								</div>
							))}
						</Queue>
					)}
					<form className="composer">
						<textarea aria-label="Message" />
						<button type="button">Stop</button>
						<button type="button">Send</button>
					</form>
				</div>
			</div>
		</div>
	);
}

const element = document.createElement("div");
element.style.display = "contents";
document.body.replaceChildren(element);
createRoot(element).render(<Fixture />);
