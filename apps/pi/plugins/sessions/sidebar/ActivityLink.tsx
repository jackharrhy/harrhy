// Incidental activity disclosure on an otherwise unchanged session navigation link.
import { inPage, SideNavigation } from "@p2/app/v1/web";
import { type ReactNode, useId, useRef } from "react";

/** Keeps the link a direct row child, with a noninteractive native tooltip and ordinary click navigation. */
export function ActivityLink({
	className,
	href,
	title,
	active,
	children,
	activity,
	onActivate,
}: {
	className: string;
	href: string;
	title?: string;
	active: boolean;
	children: ReactNode;
	activity: string;
	onActivate: () => void;
}) {
	const id = useId();
	const popup = useRef<HTMLDivElement>(null);
	const touch = useRef(false);
	const show = (anchor: HTMLAnchorElement) => {
		const element = popup.current;
		if (!element) return;
		const box = anchor.getBoundingClientRect();
		element.showPopover();
		const bounds = element.getBoundingClientRect();
		const gap = Number.parseFloat(getComputedStyle(element).getPropertyValue("--s2"));
		element.style.left = `${Math.max(gap, Math.min(box.left, window.innerWidth - bounds.width - gap))}px`;
		element.style.top = `${Math.max(gap, Math.min(box.bottom + gap, window.innerHeight - bounds.height - gap))}px`;
	};
	const close = () => popup.current?.hidePopover();
	return (
		<>
			<SideNavigation.Link
				className={className}
				href={href}
				title={title}
				active={active}
				aria-describedby={id}
				onMouseEnter={(event) => show(event.currentTarget)}
				onFocus={(event) => show(event.currentTarget)}
				onBlur={() => {
					if (!touch.current) close();
				}}
				onPointerDown={(event) => {
					touch.current = event.pointerType === "touch";
				}}
				onKeyDown={() => {
					touch.current = false;
				}}
				onClick={(event) => {
					inPage(onActivate)(event);
					// Show after the tap's native light-dismiss step, without consuming its navigation.
					if (touch.current) show(event.currentTarget);
				}}
			>
				<span className="nav-label">{children}</span>
			</SideNavigation.Link>
			<div ref={popup} id={id} popover="auto" role="tooltip" className="session-activity-popover">
				{activity}
			</div>
		</>
	);
}
