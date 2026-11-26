import { setIcon } from "obsidian";
import type { ListGroupMode, ParsedTask } from "../types";
import {
	groupTasksByPath,
	groupTasksByTag,
	sortTasksForList,
} from "../services/task-queries";
import { clearChildren, el } from "./dom";
import { renderTaskRow, type TaskRowHandlers, type TaskRowLabels } from "./task-row";

export interface TaskListViewLabels {
	title: string;
	empty: string;
	untagged: string;
	count: (n: number) => string;
	row: TaskRowLabels;
}

export interface TaskListViewOptions {
	tasks: ParsedTask[];
	groupMode: ListGroupMode;
	hideCompleted: boolean;
	labels: TaskListViewLabels;
	handlers: TaskRowHandlers;
}

function renderGroup(
	parent: HTMLElement,
	title: string,
	countLabel: string,
	icon: string,
	tasks: ParsedTask[],
	handlers: TaskRowHandlers,
	rowLabels: TaskRowLabels,
): void {
	if (!tasks.length) return;
	const group = el("div", { cls: "todo-group", parent });
	const head = el("div", { cls: "todo-group__head", parent: group });
	const ico = el("span", { parent: head });
	try {
		setIcon(ico, icon);
	} catch {
		ico.textContent = "";
	}
	el("span", { cls: "todo-group__path", text: title, parent: head });
	el("span", { cls: "todo-section__meta", text: countLabel, parent: head });
	for (const task of tasks) renderTaskRow(group, task, "list", handlers, rowLabels);
}

export function renderTaskListView(host: HTMLElement, options: TaskListViewOptions): void {
	clearChildren(host);
	const { labels, handlers } = options;
	let tasks = sortTasksForList(options.tasks);
	if (options.hideCompleted) tasks = tasks.filter((t) => !t.completed);

	const head = el("div", { cls: "todo-myday-head", parent: host });
	el("div", { cls: "todo-myday-head__title", text: labels.title, parent: head });
	el("div", {
		cls: "todo-myday-head__sub",
		text: labels.count(tasks.length),
		parent: head,
	});

	const scroll = el("div", { cls: "todo-scroll", parent: host });
	if (!tasks.length) {
		el("div", { cls: "todo-empty", text: labels.empty, parent: scroll });
		return;
	}

	if (options.groupMode === "flat") {
		for (const task of tasks) renderTaskRow(scroll, task, "list", handlers, labels.row);
		return;
	}

	if (options.groupMode === "document") {
		for (const [path, list] of groupTasksByPath(tasks)) {
			renderGroup(
				scroll,
				path,
				labels.count(list.length),
				"file",
				sortTasksForList(list),
				handlers,
				labels.row,
			);
		}
		return;
	}

	const untaggedKey = "__untagged__";
	const byTag = groupTasksByTag(tasks, untaggedKey);
	const keys = [...byTag.keys()].sort((a, b) => {
		if (a === untaggedKey) return 1;
		if (b === untaggedKey) return -1;
		return a.localeCompare(b, "zh");
	});
	for (const key of keys) {
		const list = byTag.get(key) ?? [];
		renderGroup(
			scroll,
			key === untaggedKey ? labels.untagged : key,
			labels.count(list.length),
			key === untaggedKey ? "hash" : "tag",
			sortTasksForList(list),
			handlers,
			labels.row,
		);
	}
}
