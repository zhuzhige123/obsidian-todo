import type { ListGroupMode, ParsedTask } from "../types";
import {
	groupTasksByPath,
	groupTasksByTag,
	sortTasksForList,
} from "../services/task-queries";
import { clearChildren, el } from "./dom";
import { tagChipLabel } from "../utils/note-path";
import { documentGroupTitle, renderTaskGroup } from "./task-group";
import {
	beginRootDraft,
	renderTaskForest,
	type TaskForestDraftHandlers,
} from "./task-forest";
import { type TaskRowHandlers, type TaskRowLabels } from "./task-row";

export interface TaskListViewLabels {
	title: string;
	empty: string;
	untagged: string;
	count: (n: number) => string;
	addRootTask: string;
	row: TaskRowLabels;
}

export interface TaskListViewOptions {
	tasks: ParsedTask[];
	groupMode: ListGroupMode;
	hideCompleted: boolean;
	labels: TaskListViewLabels;
	handlers: TaskRowHandlers;
	indexById?: Map<string, ParsedTask>;
	linkParentChild?: boolean;
	showNestGuideLines?: boolean;
	draftHandlers?: TaskForestDraftHandlers;
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

	const scroll = el("div", {
		cls: "todo-scroll",
		parent: host,
		attr: { tabindex: "-1" },
	});
	if (!tasks.length) {
		el("div", { cls: "todo-empty", text: labels.empty, parent: scroll });
		return;
	}

	const nestOpts = {
		indexById: options.indexById,
		linkParentChild: options.linkParentChild !== false,
		showNestGuideLines: options.showNestGuideLines === true,
		draftHandlers: options.draftHandlers,
	};

	const requestRootDraft = (path: string, groupKey: string): void => {
		beginRootDraft(path, groupKey);
		handlers.onNestCollapse?.(
			tasks.find((t) => t.path === path) ?? tasks[0]!,
			false,
		);
	};

	if (options.groupMode === "flat") {
		renderTaskForest({
			parent: scroll,
			tasks,
			mode: "list",
			handlers,
			labels: labels.row,
			rowOptions: { hideSource: true },
			...nestOpts,
		});
		return;
	}

	if (options.groupMode === "document") {
		for (const [path, list] of groupTasksByPath(tasks)) {
			renderTaskGroup(scroll, {
				variant: "document",
				title: documentGroupTitle(path),
				tooltip: path,
				collapseKey: `doc:${path}`,
				countLabel: labels.count(list.length),
				tasks: sortTasksForList(list),
				handlers,
				rowLabels: labels.row,
				rowMode: "list",
				rootTaskPath: path,
				addRootLabel: labels.addRootTask,
				onRequestRootDraft: requestRootDraft,
				...nestOpts,
			});
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
		const isUntagged = key === untaggedKey;
		const rawTag = isUntagged ? labels.untagged : key;
		const rootPath = list[0]?.path;
		renderTaskGroup(scroll, {
			variant: "tag",
			chips: [
				{
					label: isUntagged ? labels.untagged : tagChipLabel(key),
					tooltip: rawTag,
					colorKey: isUntagged ? undefined : key,
				},
			],
			collapseKey: `tag:${key}`,
			countLabel: labels.count(list.length),
			tasks: sortTasksForList(list),
			handlers,
			rowLabels: labels.row,
			rowMode: "list",
			rootTaskPath: rootPath,
			addRootLabel: labels.addRootTask,
			onRequestRootDraft: requestRootDraft,
			...nestOpts,
		});
	}
}
