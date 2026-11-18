// The view kinds of the page: the pane of each kind of view beside the transcript, contributed by web facets and keyed
// by kind (the views plugin's built-in kinds; the artifacts plugin's `html` and `md`; any plugin's, an agent-written one
// included, under its own name). The views plugin serves the registry and lays the panes out (`plugins/views`,
// docs/views.md); a plugin's tool card may render the same pane inline in the transcript.
import type { ComponentType } from "react";
import type { Annotation, Selection, View } from "../../plugins/views/contract.ts";
import { keyedRegistry } from "../runtime/chord.ts";

/** What a pane gets: the item it shows, where it shows, whether the person may change it, and its annotations. */
export type PaneProps = {
	readonly session: string;
	/** The item the view shows (an artifact's ID, a Markdown file); absent for a view of the whole kind. */
	readonly item?: string;
	/** In the transcript (a tool card), not beside it: no view, no selection, no annotations. */
	readonly inline: boolean;
	/** The view beside the transcript (absent inline): its ID, kind and title. */
	readonly view?: View;
	/** The person may send in the session: their selections and changes are saved. */
	readonly editable: boolean;
	/** Sets (null: clears) the person's selection in this view; does nothing inline. */
	readonly select: (selection: Pick<Selection, "summary" | "data"> | null) => void;
	/** The annotations on this view (none inline). */
	readonly annotations: readonly Annotation[];
};

/** A view kind as a web facet contributes it: its pane. */
export type ViewKind = { readonly Pane: ComponentType<PaneProps> };

/** The panes of the view kinds, by kind. */
export const ViewKinds = keyedRegistry<ViewKind>("p2.view-kinds");

/** An owner-local pane never receives shared view, selection, annotation or frame-capture capabilities. */
export type OwnerPaneProps = { readonly session: string };

/** A constant launcher and pane; its open state belongs to this device, never to the shared Views document. */
export type OwnerViewKind = { readonly title: string; readonly Pane: ComponentType<OwnerPaneProps> };

/** Owner-local plugin panes, rendered only with a live owner Access binding. */
export const OwnerViewKinds = keyedRegistry<OwnerViewKind>("p2.owner-view-kinds");
