import { setIcon } from "obsidian";
import type { ParsedTask } from "../types";
import { noteDisplayName } from "../utils/note-path";
import { el } from "./dom";
import { renderTagChip } from "./tag-chip";
import {
	beginRootDraft,
	renderTaskForest,
	type TaskForestDraftHandlers,
} from "./task-forest";
import {
	type TaskRowHandlers,
	type TaskRowLabels,
	type TaskRowMode,
	type TaskRowOptions,
} from "./task-row";

/** Survives list re-renders within the same plugin session. */
const collapsedGroupKeys = new Set<string>();

export type TaskGroupVariant = "document" | "tag";

/** One capsule in a tag group header (supports multiple side-by-side). */
export interface TaskGroupChip {
	/** Visible label — `#` already stripped for tag chips. */
	label: string;
	/** Native tooltip; for tags this is the raw `#tag`. */
	tooltip: string;
	/**
	 * Stable key for hash color. Omit for neutral capsule (e.g. untagged).
	 * Prefer raw tag text so `#foo` and `foo` share a color.
	 */
	colorKey?: string;
}

export interface TaskGroupOptions {
	variant?: TaskGroupVariant;
	/** Document / plain title when not using chips. */
	title?: string;
	/** Tag capsules; when set, replaces the plain title. */
	chips?: TaskGroupChip[];
	/** Full path / identity shown in head tooltip when not using chips. */
	tooltip?: string;
	collapseKey?: string;
	countLabel: string;
	tasks: ParsedTask[];
	handlers: TaskRowHandlers;
	rowLabels: TaskRowLabels;
	rowMode?: TaskRowMode;
	rowOptions?: TaskRowOptions;
	indexById?: Map<string, ParsedTask>;
	linkParentChild?: boolean;
	showNestGuideLines?: boolean;
	draftHandlers?: TaskForestDraftHandlers;
	/** Target note path for “add root task” in this group. */
	rootTaskPath?: string;
	addRootLabel?: string;
	onRequestRootDraft?: (path: string, groupKey: string) => void;
}

function safeSetIcon(node: HTMLElement, name: string): void {
	try {
		setIcon(node, name);
	} catch {
		node.textContent = "";
	}
}

/** Document-grouped header title: basename without `.md`. */
export function documentGroupTitle(path: string): string {
	return noteDisplayName(path);
}

/**
 * Group header is a collapse control only — never a task row
 * (no checkbox, no completion strike-through).
 */
export function renderTaskGroup(parent: HTMLElement, options: TaskGroupOptions): void {
	const { tasks, handlers, rowLabels, rowOptions } = options;
	if (!tasks.length && !options.draftHandlers) return;

	const variant = options.variant ?? (options.chips?.length ? "tag" : "document");
	const chips = options.chips?.filter((c) => c.label.trim().length > 0) ?? [];
	const title = options.title?.trim() || chips[0]?.label || "";
	const rowMode = options.rowMode ?? "list";
	const collapseKey =
		options.collapseKey ??
		options.tooltip ??
		(chips.length ? chips.map((c) => c.tooltip).join(",") : title);
	const collapsed = collapsedGroupKeys.has(collapseKey);
	const rootPath = options.rootTaskPath ?? tasks[0]?.path ?? null;
	const canAddRoot = !!rootPath && (!!options.onRequestRootDraft || !!options.draftHandlers);

	const group = el("div", {
		cls: [
			"todo-group",
			`todo-group--${variant}`,
			collapsed ? "is-collapsed" : "",
		],
		parent,
		attr: { "data-group-key": collapseKey },
	});

	const ariaLabel =
		variant === "tag"
			? chips.map((c) => c.tooltip).join(" · ") || title
			: (options.tooltip ?? title);

	const head = el("div", {
		cls: "todo-group__head",
		parent: group,
	});

	const toggle = el("button", {
		cls: "todo-group__toggle",
		parent: head,
		attr: {
			type: "button",
			title: variant === "document" ? (options.tooltip ?? title) : undefined,
			"aria-expanded": String(!collapsed),
			"aria-label": ariaLabel || title,
		},
	});

	const chevron = el("span", {
		cls: "todo-group__chevron",
		parent: toggle,
		attr: { "aria-hidden": "true" },
	});
	safeSetIcon(chevron, "chevron-down");

	if (chips.length > 0) {
		const chipRow = el("span", { cls: "todo-group__chips", parent: toggle });
		for (const chip of chips) {
			renderTagChip(chipRow, {
				label: chip.label,
				tooltip: chip.tooltip,
				colorKey: chip.colorKey,
			});
		}
	} else {
		el("span", { cls: "todo-group__title", text: title, parent: toggle });
	}

	el("span", { cls: "todo-group__count", text: options.countLabel, parent: toggle });

	if (canAddRoot && rootPath) {
		const add = el("button", {
			cls: ["todo-group__add", "clickable-icon"],
			parent: head,
			attr: {
				type: "button",
				title: options.addRootLabel ?? "新增任务",
				"aria-label": options.addRootLabel ?? "新增任务",
			},
		});
		safeSetIcon(add, "plus");
		add.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (group.classList.contains("is-collapsed")) {
				group.classList.remove("is-collapsed");
				toggle.setAttribute("aria-expanded", "true");
				collapsedGroupKeys.delete(collapseKey);
			}
			if (options.onRequestRootDraft) {
				options.onRequestRootDraft(rootPath, collapseKey);
			} else {
				beginRootDraft(rootPath, collapseKey);
				options.handlers.onNestCollapse?.(tasks[0]!, false);
			}
		});
	}

	const body = el("div", { cls: "todo-group__body", parent: group });
	renderTaskForest({
		parent: body,
		tasks,
		indexById: options.indexById,
		mode: rowMode,
		handlers,
		labels: rowLabels,
		rowOptions: { ...rowOptions, hideSource: true },
		linkParentChild: options.linkParentChild !== false,
		showNestGuideLines: options.showNestGuideLines === true,
		draftHandlers: options.draftHandlers,
		groupKey: collapseKey,
	});

	toggle.addEventListener("click", (event) => {
		event.preventDefault();
		const next = !group.classList.contains("is-collapsed");
		group.classList.toggle("is-collapsed", next);
		toggle.setAttribute("aria-expanded", String(!next));
		if (next) collapsedGroupKeys.add(collapseKey);
		else collapsedGroupKeys.delete(collapseKey);
	});
}
