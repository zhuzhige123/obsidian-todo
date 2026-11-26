import { setIcon } from "obsidian";
import type { ParsedTask } from "../types";
import { formatShortDate, isOverdue, toLocalDateKey } from "../utils/dates";
import { el } from "./dom";

export interface TaskRowHandlers {
	onOpen: (task: ParsedTask) => void;
	onToggleComplete: (task: ParsedTask, completed: boolean) => void;
	onAddToMyDay?: (task: ParsedTask) => void;
	onRemoveFromMyDay?: (task: ParsedTask) => void;
}

export type TaskRowMode = "suggest" | "myday" | "day" | "list";

export interface TaskRowLabels {
	complete: string;
	incomplete: string;
	openTask: (title: string) => string;
	addToMyDay: string;
	removeFromMyDay: string;
	recurring: string;
	createdToday: string;
}

function displayPath(path: string): string {
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	if (parts.length <= 2) return parts.join("/");
	return parts.slice(-2).join("/");
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
	recurring: "重复",
	createdToday: "创建于当天",
};

export function renderTaskRow(
	parent: HTMLElement,
	task: ParsedTask,
	mode: TaskRowMode,
	handlers: TaskRowHandlers,
	labels: TaskRowLabels = DEFAULT_LABELS,
): HTMLElement {
	const today = toLocalDateKey();
	const row = el("div", {
		cls: [
			"todo-task",
			mode === "suggest" ? "todo-task--suggest" : "",
			mode === "myday" ? "todo-task--myday" : "",
			mode === "list" ? "todo-task--list" : "",
			task.completed ? "is-done" : "",
		],
		parent,
		attr: { "data-id": task.id },
	});

	const check = el("button", {
		cls: ["todo-check", "clickable-icon", task.completed ? "is-on" : ""],
		parent: row,
		attr: {
			type: "button",
			"aria-label": task.completed ? labels.incomplete : labels.complete,
			"aria-pressed": String(task.completed),
		},
	});
	safeSetIcon(check, "check");
	check.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		const next = !task.completed;
		if (next) {
			check.classList.add("is-on");
			row.classList.add("is-done");
			if (mode !== "list") row.classList.add("is-removing");
		} else {
			check.classList.remove("is-on");
			row.classList.remove("is-done");
		}
		handlers.onToggleComplete(task, next);
	});

	const main = el("button", {
		cls: "todo-task__main",
		parent: row,
		attr: { type: "button", "aria-label": labels.openTask(task.title) },
	});
	el("span", { cls: "todo-task__title", text: task.title, parent: main });

	const meta = el("span", { cls: "todo-task__meta", parent: main });
	const left = el("span", { cls: "todo-task__meta-left", parent: meta });

	const dueKey = task.due;
	if (dueKey) {
		const overdue = isOverdue(dueKey, today, task.completed);
		const due = el("span", {
			cls: ["todo-due", overdue ? "is-overdue" : "is-soon"],
			parent: left,
		});
		const dueIcon = el("span", { cls: "todo-due__icon", parent: due });
		safeSetIcon(dueIcon, "calendar");
		el("span", { text: formatShortDate(dueKey, today), parent: due });
	} else if (task.scheduled) {
		const scheduled = el("span", { cls: ["todo-due", "is-soon"], parent: left });
		const ico = el("span", { cls: "todo-due__icon", parent: scheduled });
		safeSetIcon(ico, "clock");
		el("span", { text: formatShortDate(task.scheduled, today), parent: scheduled });
	} else if (task.created === today) {
		el("span", { cls: ["todo-due", "is-plain"], text: labels.createdToday, parent: left });
	}

	if (task.recurring) {
		const ico = el("span", {
			cls: "todo-meta-ico",
			parent: left,
			attr: { title: labels.recurring },
		});
		safeSetIcon(ico, "refresh-cw");
	}

	el("span", {
		cls: "todo-task__meta-right",
		text: displayPath(task.path),
		parent: meta,
		attr: { title: task.path },
	});

	main.addEventListener("click", (event) => {
		event.preventDefault();
		handlers.onOpen(task);
	});

	if (mode === "suggest" && handlers.onAddToMyDay && !task.completed) {
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
	} else if (mode === "myday" && handlers.onRemoveFromMyDay) {
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
	} else if (mode === "list" && handlers.onAddToMyDay && !task.completed) {
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
			handlers.onAddToMyDay?.(task);
		});
	}

	return row;
}
