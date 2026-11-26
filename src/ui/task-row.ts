import { TFile, setIcon, type App } from "obsidian";
import { getTaskVisualKind } from "../services/task-kind";
import { TASK_BRANCH_PAD_PX, TASK_ROW_PAD_LEFT_PX } from "../constants";
import type { ParsedTask } from "../types";
import { formatShortDate, isOverdue, toLocalDateKey } from "../utils/dates";
import { shortNoteLabel, tagChipLabel } from "../utils/note-path";
import {
	renderDueControl,
	type DateTimePickerLabels,
} from "./date-time-picker";
import { el } from "./dom";
import { renderTagChip } from "./tag-chip";

export interface TaskRowHandlers {
	onOpen: (task: ParsedTask) => void;
	onToggleComplete: (task: ParsedTask, completed: boolean) => void;
	onAddToMyDay?: (task: ParsedTask) => void;
	onRemoveFromMyDay?: (task: ParsedTask) => void;
	onAddSubtask?: (task: ParsedTask) => void;
	onNestCollapse?: (task: ParsedTask, collapsed: boolean) => void;
	/** Mark row as the keyboard / shortcut selection target. */
	onSelect?: (task: ParsedTask) => void;
	/** Update 📅 due (+ optional time) on an existing task. */
	onSetDue?: (
		task: ParsedTask,
		due: string | null,
		dueTime: string | null,
	) => void;
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
	addSubtaskDisabledCollapsed: string;
	addSubtaskMaxDepth: string;
	collapseChildren: string;
	expandChildren: string;
	recurring: string;
	createdToday: string;
	hasAttachment: string;
	bugIssue: string;
	duePicker: DateTimePickerLabels;
}

export interface TaskRowNestOptions {
	displayDepth: number;
	visibleChildCount: number;
	checkState: "unchecked" | "checked" | "indeterminate";
	collapsed: boolean;
	/** Draw a short horizontal branch into the parent channel (depth > 0). */
	showGuideLines: boolean;
	/** Row `+` present but not clickable (collapsed parent / max depth). */
	addDisabled?: boolean;
	addDisabledReason?: "collapsed" | "max-depth" | null;
	onToggleCollapse: (task: ParsedTask, collapsed: boolean) => void;
}

export interface TaskRowOptions {
	/** When true, never render source path on the row (grouped list/day). */
	hideSource?: boolean;
	/** Keyboard / click selection highlight. */
	selected?: boolean;
	nest?: TaskRowNestOptions;
}

function safeSetIcon(node: HTMLElement, name: string): void {
	try {
		setIcon(node, name);
	} catch {
		node.textContent = "";
	}
}

const DEFAULT_DUE_PICKER: DateTimePickerLabels = {
	setDue: "设置日期",
	clearDueAria: "清除日期和时间",
	closePanel: "关闭",
	prevMonth: "上一月",
	nextMonth: "下一月",
};

const DEFAULT_LABELS: TaskRowLabels = {
	complete: "完成",
	incomplete: "标为未完成",
	openTask: (title) => `打开 ${title}`,
	addToMyDay: "添加到我的一天",
	removeFromMyDay: "移出我的一天",
	addSubtask: "新增子任务",
	addSubtaskDisabledCollapsed: "请先展开父任务",
	addSubtaskMaxDepth: "已达最大嵌套层级",
	collapseChildren: "折叠子任务",
	expandChildren: "展开子任务",
	recurring: "重复",
	createdToday: "创建于当天",
	hasAttachment: "附图",
	bugIssue: "待解决问题",
	duePicker: DEFAULT_DUE_PICKER,
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
	const selected = options.selected === true;

	const row = el("div", {
		cls: [
			"todo-task",
			`todo-task--${mode}`,
			kind !== "normal" ? `todo-task--${kind}` : "",
			checkState === "checked" ? "is-done" : "",
			hasChildren ? "has-children" : "",
			selected ? "is-selected" : "",
			nest?.showGuideLines && depth > 0 ? "has-nest-branch" : "",
		],
		parent,
		attr: {
			"data-id": task.id,
			"data-depth": String(depth),
			tabindex: "0",
		},
	});
	const branched = !!nest?.showGuideLines && depth > 0;
	const rowPad = branched ? TASK_BRANCH_PAD_PX : TASK_ROW_PAD_LEFT_PX;
	row.style.paddingLeft = `${rowPad}px`;
	row.style.setProperty("--todo-row-pad", `${rowPad}px`);

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
		/* Read live DOM — local check patches update classes without re-binding. */
		const currentlyOn = check.classList.contains("is-on");
		handlers.onToggleComplete(task, !currentlyOn);
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
	const overdue = isOverdue(dueKey, today, checkState === "checked");
	renderDueControl({
		parent: chips,
		value: { due: dueKey, dueTime: task.dueTime },
		labels: labels.duePicker,
		cls: [
			"todo-due-ctl--row",
			dueKey ? (overdue ? "is-overdue" : "is-soon") : "",
		],
		onChange: (next) => {
			handlers.onSetDue?.(task, next.due, next.dueTime);
		},
	});

	if (!dueKey && task.scheduled) {
		const scheduled = el("span", {
			cls: ["todo-chip", "todo-due", "is-soon"],
			parent: chips,
		});
		const ico = el("span", { cls: "todo-due__icon", parent: scheduled });
		safeSetIcon(ico, "clock");
		el("span", { text: formatShortDate(task.scheduled, today), parent: scheduled });
	} else if (!dueKey && task.created === today) {
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
		handlers.onSelect?.(task);
		handlers.onOpen(task);
	});

	row.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (target.closest("button, a, input, textarea")) return;
		handlers.onSelect?.(task);
	});

	row.addEventListener("focus", () => {
		handlers.onSelect?.(task);
	});

	const canAddSubtask =
		!!handlers.onAddSubtask && (mode === "list" || mode === "day");
	const canAddMyDay =
		mode === "suggest" && !!handlers.onAddToMyDay && checkState !== "checked";
	const canRemoveMyDay = mode === "myday" && !!handlers.onRemoveFromMyDay;

	if (canAddSubtask || canAddMyDay || canRemoveMyDay) row.classList.add("has-action");

	if (canAddSubtask) {
		const disabled = nest?.addDisabled === true;
		const disabledTitle =
			nest?.addDisabledReason === "collapsed"
				? labels.addSubtaskDisabledCollapsed
				: nest?.addDisabledReason === "max-depth"
					? labels.addSubtaskMaxDepth
					: labels.addSubtask;
		const add = el("button", {
			cls: ["todo-task__add", "clickable-icon", disabled ? "is-disabled" : ""],
			parent: row,
			attr: {
				type: "button",
				title: disabledTitle,
				"aria-label": disabledTitle,
				"aria-disabled": disabled ? "true" : "false",
			},
		});
		if (disabled) add.setAttribute("disabled", "true");
		safeSetIcon(add, "plus");
		add.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (disabled) return;
			handlers.onSelect?.(task);
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
