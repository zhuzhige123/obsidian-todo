import { el } from "./dom";
import { tagColorSlot } from "./tag-color";

export interface TagChipOptions {
	label: string;
	/** Full raw tag for tooltip, e.g. `#test-work`. */
	tooltip: string;
	/** Hash key; omit for neutral muted capsule. */
	colorKey?: string;
}

/** Shared Morandi capsule used by tag group headers and stats ranking. */
export function renderTagChip(parent: HTMLElement, options: TagChipOptions): HTMLElement {
	const colorKey = options.colorKey?.trim();
	return el("span", {
		cls: [
			"todo-chip",
			"todo-group__chip",
			colorKey ? "todo-group__chip--colored" : "todo-group__chip--muted",
		],
		text: options.label,
		parent,
		attr: {
			title: options.tooltip,
			"data-tag-color": colorKey ? String(tagColorSlot(colorKey)) : undefined,
		},
	});
}
