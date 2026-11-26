import type { ParsedTask } from "../types";
import type { AttentionItem, StatusShare, TaskStatsSnapshot } from "../services/task-stats";
import { clearChildren, el, svgEl } from "./dom";

export interface StatsViewHandlers {
	onOpen: (task: ParsedTask) => void;
}

export interface StatsViewLabels {
	empty: string;
	status: string;
	tags: string;
	attention: string;
	noTags: string;
	noOverdue: string;
	overdueDays: (days: number) => string;
	openTask: (title: string) => string;
}

function renderSection(parent: HTMLElement, title: string): HTMLElement {
	const section = el("section", { cls: "todo-stats-section", parent });
	el("div", { cls: "todo-stats-section__title", text: title, parent: section });
	return section;
}

function renderRing(parent: HTMLElement, item: StatusShare): void {
	const cell = el("div", {
		cls: ["todo-stats-ring", `todo-stats-ring--${item.id}`],
		parent,
		attr: { title: `${item.label} ${item.count}` },
	});
	const svg = svgEl("svg", {
		cls: "todo-stats-ring__svg",
		attr: {
			viewBox: "0 0 36 36",
			"aria-hidden": "true",
		},
	});

	svgEl("circle", {
		cls: "todo-stats-ring__track",
		parent: svg,
		attr: {
			cx: "18",
			cy: "18",
			r: "15.5",
			fill: "none",
			"stroke-width": "3.2",
			pathLength: "100",
		},
	});

	svgEl("circle", {
		cls: "todo-stats-ring__value",
		parent: svg,
		attr: {
			cx: "18",
			cy: "18",
			r: "15.5",
			fill: "none",
			"stroke-width": "3.2",
			pathLength: "100",
			"stroke-dasharray": `${item.percent} ${Math.max(0, 100 - item.percent)}`,
			"stroke-dashoffset": "25",
			"stroke-linecap": "round",
		},
	});
	const dial = el("div", { cls: "todo-stats-ring__dial", parent: cell });
	dial.appendChild(svg);
	el("div", {
		cls: "todo-stats-ring__pct",
		text: `${item.percent}%`,
		parent: dial,
	});
	el("div", { cls: "todo-stats-ring__label", text: item.label, parent: cell });
}

function renderTagRanks(
	parent: HTMLElement,
	tags: TaskStatsSnapshot["tags"],
	emptyLabel: string,
): void {
	if (!tags.length) {
		el("div", { cls: "todo-stats-empty", text: emptyLabel, parent });
		return;
	}
	const list = el("div", { cls: "todo-stats-tags", parent });
	const maxPct = Math.max(1, ...tags.map((t) => t.percent));
	for (const tag of tags) {
		const row = el("div", { cls: "todo-stats-tags__row", parent: list });
		el("div", { cls: "todo-stats-tags__name", text: tag.label, parent: row });
		const track = el("div", { cls: "todo-stats-tags__track", parent: row });
		el("div", {
			cls: "todo-stats-tags__fill",
			parent: track,
			attr: { style: `width:${Math.round((tag.percent / maxPct) * 100)}%` },
		});
		el("div", {
			cls: "todo-stats-tags__pct",
			text: `${tag.percent}%`,
			parent: row,
		});
	}
}

function renderAttention(
	parent: HTMLElement,
	items: AttentionItem[],
	handlers: StatsViewHandlers,
	labels: StatsViewLabels,
): void {
	if (!items.length) {
		el("div", { cls: "todo-stats-empty", text: labels.noOverdue, parent });
		return;
	}
	const list = el("div", { cls: "todo-stats-attention", parent });
	for (const item of items) {
		const row = el("div", {
			cls: ["todo-task", "todo-task--stats"],
			parent: list,
			attr: { "data-id": item.task.id },
		});
		el("span", {
			cls: "todo-stats-attention__dot",
			parent: row,
			attr: { "aria-hidden": "true" },
		});
		const main = el("button", {
			cls: "todo-task__main",
			parent: row,
			attr: { type: "button", "aria-label": labels.openTask(item.task.title) },
		});
		el("span", { cls: "todo-task__title", text: item.task.title, parent: main });
		const meta = el("span", { cls: "todo-task__meta", parent: main });
		const left = el("span", { cls: "todo-task__meta-left", parent: meta });
		el("span", {
			cls: ["todo-due", "is-overdue"],
			text: labels.overdueDays(item.overdueDays),
			parent: left,
		});
		main.addEventListener("click", () => handlers.onOpen(item.task));
	}
}

export function renderStatsView(
	host: HTMLElement,
	stats: TaskStatsSnapshot,
	handlers: StatsViewHandlers,
	labels: StatsViewLabels,
): void {
	clearChildren(host);
	const scroll = el("div", { cls: ["todo-scroll", "todo-stats"], parent: host });

	if (stats.total === 0) {
		el("div", {
			cls: "todo-empty",
			text: labels.empty,
			parent: scroll,
		});
		return;
	}

	const statusSection = renderSection(scroll, labels.status);
	const rings = el("div", { cls: "todo-stats-rings", parent: statusSection });
	for (const item of stats.status) renderRing(rings, item);

	const tagSection = renderSection(scroll, labels.tags);
	renderTagRanks(tagSection, stats.tags, labels.noTags);

	const attentionSection = renderSection(scroll, labels.attention);
	renderAttention(attentionSection, stats.attention, handlers, labels);
}
