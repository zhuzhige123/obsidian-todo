import { TFile, setIcon, type App } from "obsidian";
import { getTaskVisualKind } from "../services/task-kind";
import { TASK_INDENT_STEP_PX } from "../constants";
import type { ParsedTask } from "../types";
import { formatShortDate, isOverdue, toLocalDateKey } from "../utils/dates";
import { shortNoteLabel, tagChipLabel } from "../utils/note-path";
import { el } from "./dom";
import { renderTagChip } from "./tag-chip";

export interface TaskRowHandlers {
	onOpen: (task: ParsedTask) => void;
	onToggleComplete: (task: ParsedTask, completed: boolean) => void;
	onAddToMyDay?: (task: ParsedTask) => void;
	onRemoveFromMyDay?: (task: ParsedTask) => void;
	onAddSubtask?: (task: ParsedTask) => void;
	onNestCollapse?: (task: ParsedTask, collapsed: boolean) => void;
	/** Resolve vault image path for hover preview (list attachments). */
	resolveImageUrl?: (link: string, sourcePath: string) => string | null;
}

export type TaskRowMode = "suggest" | "myday" | "day" | "list";

export interface TaskRowLabels {
	complete: string;
	incomplete: string;
	openTask: (title: string) => string;
	addToMyDay: string;
	removeFromMyDay: string;
	addSubtask: string;
	collapseChildren: string;
	expandChildren: string;
	recurring: string;
	createdToday: string;
	hasAttachment: string;
	bugIssue: string;
}

export interface TaskRowNestOptions {
	displayDepth: number;
	visibleChildCount: number;
	checkState: "unchecked" | "checked" | "indeterminate";
	collapsed: boolean;
	showGuideLines: boolean;
	onToggleCollapse: (task: ParsedTask, collapsed: boolean) => void;
}

export interface TaskRowOptions {
	/** When true, never render source path on the row (grouped list/day). */
	hideSource?: boolean;
	nest?: TaskRowNestOptions;
}

function safeSetIcon(node: HTMLElement, name: string): void {
	try {
		setIcon(node, name);
	} catch {
		node.textContent = "";
	}
}

const DEFAULT_LABELS: TaskRowLabels = {
	complete: "完成",
	incomplete: "标为未完成",
	openTask: (title) => `打开 ${title}`,
	addToMyDay: "添加到我的一天",
	removeFromMyDay: "移出我的一天",
	addSubtask: "新增子任务",
	collapseChildren: "折叠子任务",
	expandChildren: "展开子任务",
	recurring: "重复",
	createdToday: "创建于当天",
	hasAttachment: "附图",
	bugIssue: "待解决问题",
};

let activeImagePreview: HTMLElement | null = null;

function dismissImagePreview(): void {
	activeImagePreview?.remove();
	activeImagePreview = null;
}

function showImagePreview(anchor: HTMLElement, url: string): void {
	dismissImagePreview();
	const tip = el("div", {
		cls: "todo-image-preview",
		attr: { role: "tooltip" },
	});
	const img = el("img", {
		parent: tip,
		attr: { src: url, alt: "" },
	});
	img.addEventListener("error", () => dismissImagePreview());
	document.body.appendChild(tip);
	activeImagePreview = tip;

	const place = (): void => {
		const rect = anchor.getBoundingClientRect();
		const tipRect = tip.getBoundingClientRect();
		const pad = 8;
		let left = rect.left;
		let top = rect.bottom + 6;
		if (left + tipRect.width > window.innerWidth - pad) {
			left = Math.max(pad, window.innerWidth - tipRect.width - pad);
		}
		if (top + tipRect.height > window.innerHeight - pad) {
			top = Math.max(pad, rect.top - tipRect.height - 6);
		}
		tip.style.left = `${Math.round(left)}px`;
		tip.style.top = `${Math.round(top)}px`;
	};

	if (img.complete) place();
	else img.addEventListener("load", place, { once: true });
	place();
}

/** Build a vault resource URL resolver bound to the Obsidian app. */
export function createImageUrlResolver(app: App): (link: string, sourcePath: string) => string | null {
	return (link, sourcePath) => {
		const file = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
		if (!(file instanceof TFile)) return null;
		return app.vault.getResourcePath(file);
	};
}

export function renderTaskRow(
	parent: HTMLElement,
	task: ParsedTask,
	mode: TaskRowMode,
	handlers: TaskRowHandlers,
	labels: TaskRowLabels = DEFAULT_LABELS,
	options: TaskRowOptions = {},
): HTMLElement {
	const today = toLocalDateKey();
	const kind = getTaskVisualKind(task);
	const nest = options.nest;
	const hideSource = options.hideSource !== false;
	const depth = nest?.displayDepth ?? 0;
	const checkState =
		nest?.checkState ?? (task.completed ? "checked" : "unchecked");
	const hasChildren = (nest?.visibleChildCount ?? 0) > 0;

	const row = el("div", {
		cls: [
			"todo-task",
			`todo-task--${mode}`,
			kind !== "normal" ? `todo-task--${kind}` : "",
			checkState === "checked" ? "is-done" : "",
			hasChildren ? "has-children" : "",
			nest?.showGuideLines && depth > 0 ? "has-nest-guide" : "",
		],
		parent,
		attr: {
			"data-id": task.id,
			"data-depth": String(depth),
		},
	});
	row.style.setProperty("--todo-nest-depth", String(depth));
	row.style.paddingLeft = `${4 + depth * TASK_INDENT_STEP_PX}px`;

	const check = el("button", {
		cls: [
			"todo-check",
			"clickable-icon",
			checkState === "checked" ? "is-on" : "",
			checkState === "indeterminate" ? "is-indeterminate" : "",
		],
		parent: row,
		attr: {
			type: "button",
			"aria-label": checkState === "checked" ? labels.incomplete : labels.complete,
			"aria-checked":
				checkState === "indeterminate"
					? "mixed"
					: String(checkState === "checked"),
			role: "checkbox",
		},
	});
	safeSetIcon(check, "check");
	check.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		const next = checkState !== "checked";
		handlers.onToggleComplete(task, next);
	});

	if (hasChildren && nest) {
		const twist = el("button", {
			cls: ["todo-task__twist", "clickable-icon", nest.collapsed ? "is-collapsed" : ""],
			parent: row,
			attr: {
				type: "button",
				"aria-expanded": String(!nest.collapsed),
				"aria-label": nest.collapsed ? labels.expandChildren : labels.collapseChildren,
			},
		});
		safeSetIcon(twist, "chevron-down");
		twist.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			nest.onToggleCollapse(task, !nest.collapsed);
		});
	} else {
		el("span", {
			cls: "todo-task__twist-spacer",
			parent: row,
			attr: { "aria-hidden": "true" },
		});
	}

	const main = el("button", {
		cls: "todo-task__main",
		parent: row,
		attr: { type: "button", "aria-label": labels.openTask(task.title) },
	});

	const titleRow = el("span", { cls: "todo-task__title-row", parent: main });
	el("span", { cls: "todo-task__title", text: task.title, parent: titleRow });
	if (kind === "bug") {
		const bug = el("span", {
			cls: "todo-task__bug",
			parent: titleRow,
			attr: { title: labels.bugIssue, "aria-label": labels.bugIssue },
		});
		safeSetIcon(bug, "alert-triangle");
	}

	const tagRow = el("span", { cls: "todo-task__tags", parent: row });
	for (const tag of task.tags) {
		renderTagChip(tagRow, {
			label: tagChipLabel(tag),
			tooltip: tag,
			colorKey: tag,
		});
	}

	const chips = el("span", { cls: "todo-task__chips", parent: row });

	const dueKey = task.due;
	if (dueKey) {
		const overdue = isOverdue(dueKey, today, checkState === "checked");
		const due = el("span", {
			cls: ["todo-chip", "todo-due", overdue ? "is-overdue" : "is-soon"],
			parent: chips,
		});
		const dueIcon = el("span", { cls: "todo-due__icon", parent: due });
		safeSetIcon(dueIcon, "calendar");
		el("span", { text: formatShortDate(dueKey, today), parent: due });
	} else if (task.scheduled) {
		const scheduled = el("span", {
			cls: ["todo-chip", "todo-due", "is-soon"],
			parent: chips,
		});
		const ico = el("span", { cls: "todo-due__icon", parent: scheduled });
		safeSetIcon(ico, "clock");
		el("span", { text: formatShortDate(task.scheduled, today), parent: scheduled });
	} else if (task.created === today) {
		el("span", {
			cls: ["todo-chip", "todo-due", "is-plain"],
			text: labels.createdToday,
			parent: chips,
		});
	}

	if (task.recurring) {
		const ico = el("span", {
			cls: ["todo-chip", "todo-meta-ico"],
			parent: chips,
			attr: { title: labels.recurring },
		});
		safeSetIcon(ico, "refresh-cw");
	}

	if (task.images.length > 0) {
		const imgBtn = el("button", {
			cls: ["todo-chip", "todo-task__attach", "clickable-icon"],
			parent: chips,
			attr: {
				type: "button",
				title: labels.hasAttachment,
				"aria-label": labels.hasAttachment,
			},
		});
		safeSetIcon(imgBtn, "image");
		imgBtn.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		imgBtn.addEventListener("mouseenter", () => {
			const first = task.images[0];
			if (!first || !handlers.resolveImageUrl) return;
			const url = handlers.resolveImageUrl(first, task.path);
			if (url) showImagePreview(imgBtn, url);
		});
		imgBtn.addEventListener("mouseleave", () => dismissImagePreview());
	}

	if (!hideSource) {
		el("span", {
			cls: ["todo-chip", "todo-task__source"],
			text: shortNoteLabel(task.path),
			parent: chips,
			attr: { title: task.path },
		});
	}

	main.addEventListener("click", (event) => {
		event.preventDefault();
		handlers.onOpen(task);
	});

	const canAddSubtask = !!handlers.onAddSubtask && mode === "list";
	const canAddMyDay =
		mode === "suggest" && !!handlers.onAddToMyDay && checkState !== "checked";
	const canRemoveMyDay = mode === "myday" && !!handlers.onRemoveFromMyDay;

	if (canAddSubtask || canAddMyDay || canRemoveMyDay) row.classList.add("has-action");

	if (canAddSubtask) {
		const add = el("button", {
			cls: ["todo-task__add", "clickable-icon"],
			parent: row,
			attr: {
				type: "button",
				title: labels.addSubtask,
				"aria-label": labels.addSubtask,
			},
		});
		safeSetIcon(add, "plus");
		add.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			handlers.onAddSubtask?.(task);
		});
	} else if (canAddMyDay) {
		appendAddToMyDayButton(row, task, handlers, labels);
	} else if (canRemoveMyDay) {
		const remove = el("button", {
			cls: ["todo-task__remove", "clickable-icon"],
			parent: row,
			attr: {
				type: "button",
				title: labels.removeFromMyDay,
				"aria-label": labels.removeFromMyDay,
			},
		});
		safeSetIcon(remove, "x");
		remove.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			handlers.onRemoveFromMyDay?.(task);
		});
	}

	return row;
}

function appendAddToMyDayButton(
	row: HTMLElement,
	task: ParsedTask,
	handlers: TaskRowHandlers,
	labels: TaskRowLabels,
): void {
	const add = el("button", {
		cls: ["todo-task__add", "clickable-icon"],
		parent: row,
		attr: {
			type: "button",
			title: labels.addToMyDay,
			"aria-label": labels.addToMyDay,
		},
	});
	safeSetIcon(add, "plus");
	add.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		row.classList.add("is-removing");
		handlers.onAddToMyDay?.(task);
	});
}
