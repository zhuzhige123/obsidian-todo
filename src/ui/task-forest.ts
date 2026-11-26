import { TASK_BRANCH_PAD_PX, TASK_MAX_DEPTH, TASK_ROW_PAD_LEFT_PX } from "../constants";
import type { ParsedTask } from "../types";
import { buildTaskTree, type TaskTreeNode } from "../services/task-tree";
import {
	renderTaskDraftRow,
	type TaskDraftRowLabels,
} from "./task-draft-row";
import {
	renderTaskRow,
	type TaskRowHandlers,
	type TaskRowLabels,
	type TaskRowMode,
	type TaskRowOptions,
} from "./task-row";
import { el } from "./dom";
import {
	clearTaskDraft,
	getSelectedTaskId,
	getTaskDraft,
	setSelectedTaskId,
	setTaskDraft,
	type TaskDraft,
} from "./task-session";

/** Session-persistent collapse state for nested task parents. */
const collapsedTaskIds = new Set<string>();

export function isTaskCollapsed(taskId: string): boolean {
	return collapsedTaskIds.has(taskId);
}

export function setTaskCollapsed(taskId: string, collapsed: boolean): void {
	if (collapsed) collapsedTaskIds.add(taskId);
	else collapsedTaskIds.delete(taskId);
}

export interface TaskForestDraftHandlers {
	labels: TaskDraftRowLabels;
	onSubmit: (
		draft: TaskDraft,
		title: string,
		due: string | null,
		dueTime: string | null,
	) => void;
	onCancel: () => void;
	onDueChange?: (due: string | null, dueTime: string | null) => void;
}

export interface RenderTaskForestOptions {
	parent: HTMLElement;
	tasks: ParsedTask[];
	indexById?: Map<string, ParsedTask>;
	mode: TaskRowMode;
	handlers: TaskRowHandlers;
	labels: TaskRowLabels;
	rowOptions?: TaskRowOptions;
	linkParentChild: boolean;
	showNestGuideLines: boolean;
	draftHandlers?: TaskForestDraftHandlers;
	groupKey?: string;
}

function renderDraftFor(
	parent: HTMLElement,
	draft: TaskDraft,
	displayDepth: number,
	showBranch: boolean,
	draftHandlers: TaskForestDraftHandlers,
): void {
	renderTaskDraftRow({
		parent,
		displayDepth,
		showGuideLines: showBranch,
		due: draft.due,
		dueTime: draft.dueTime,
		title: draft.title,
		labels: draftHandlers.labels,
		onSubmit: (title, due, dueTime) =>
			draftHandlers.onSubmit(draft, title, due, dueTime),
		onCancel: () => {
			clearTaskDraft();
			draftHandlers.onCancel();
		},
		onDueChange: (due, dueTime) => draftHandlers.onDueChange?.(due, dueTime),
	});
}

/** Begin a child draft under `parent` (expands parent; no-op if collapsed / max depth). */
export function beginChildDraft(parent: ParsedTask): boolean {
	if (parent.depth >= TASK_MAX_DEPTH) return false;
	if (collapsedTaskIds.has(parent.id)) return false;
	setTaskCollapsed(parent.id, false);
	setSelectedTaskId(parent.id);
	setTaskDraft({
		kind: "child",
		parentId: parent.id,
		path: parent.path,
		due: null,
		dueTime: null,
		title: "",
	});
	return true;
}

function findRowByTaskId(host: HTMLElement, taskId: string): HTMLElement | null {
	const rows = host.querySelectorAll(".todo-task[data-id]");
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (row instanceof HTMLElement && row.getAttribute("data-id") === taskId) {
			return row;
		}
	}
	return null;
}

/** Drop any mounted draft rows (and empty child rails they alone occupied). */
export function removeDraftRowsInPlace(host: HTMLElement): void {
	host.querySelectorAll('.todo-task[data-draft="true"]').forEach((node) => {
		if (!(node instanceof HTMLElement)) return;
		const inner = node.parentElement;
		node.remove();
		if (!(inner instanceof HTMLElement)) return;
		if (!inner.classList.contains("todo-tree-children__inner")) return;
		if (inner.childElementCount > 0) return;
		const children = inner.parentElement;
		if (!(children instanceof HTMLElement) || !children.classList.contains("todo-tree-children")) {
			return;
		}
		const treeNode = children.parentElement;
		children.remove();
		if (!(treeNode instanceof HTMLElement)) return;
		const parentRow = treeNode.querySelector(":scope > .todo-task");
		parentRow?.classList.remove("has-children");
	});
}

/**
 * Open a child draft under `parent` by mounting the input row in place.
 * Avoids a full list rebuild (which scrolls / jitters the viewport).
 */
export function openChildDraftInPlace(
	host: HTMLElement,
	parent: ParsedTask,
	draftHandlers: TaskForestDraftHandlers,
	showNestGuideLines: boolean,
): boolean {
	if (!beginChildDraft(parent)) return false;
	const draft = getTaskDraft();
	if (!draft || draft.kind !== "child") return false;

	const row = findRowByTaskId(host, parent.id);
	if (!row) return false;
	const wrap = row.closest(".todo-tree-node");
	if (!(wrap instanceof HTMLElement)) return false;

	removeDraftRowsInPlace(host);

	let childrenEl = wrap.querySelector(":scope > .todo-tree-children");
	if (!(childrenEl instanceof HTMLElement)) {
		const rail = el("div", {
			cls: ["todo-tree-children", showNestGuideLines ? "has-guide" : ""],
			parent: wrap,
			attr: { "data-parent-id": parent.id },
		});
		el("div", { cls: "todo-tree-children__inner", parent: rail });
		row.classList.add("has-children");
		childrenEl = rail;
	}
	childrenEl.classList.remove("is-collapsed");
	const twist = row.querySelector(":scope > .todo-task__twist");
	if (twist instanceof HTMLElement) {
		twist.classList.remove("is-collapsed");
		twist.setAttribute("aria-expanded", "true");
	}

	const inner = childrenEl.querySelector(":scope > .todo-tree-children__inner");
	if (!(inner instanceof HTMLElement)) return false;

	const displayDepth = Math.min(TASK_MAX_DEPTH, Math.max(0, parent.depth) + 1);
	renderDraftFor(
		inner,
		draft,
		displayDepth,
		showNestGuideLines && displayDepth > 0,
		draftHandlers,
	);

	host.querySelectorAll(".todo-task[data-id]").forEach((elNode) => {
		elNode.classList.toggle(
			"is-selected",
			elNode.getAttribute("data-id") === parent.id,
		);
	});
	return true;
}

export function beginSiblingDraft(anchor: ParsedTask): void {
	setSelectedTaskId(anchor.id);
	setTaskDraft({
		kind: "sibling",
		afterId: anchor.id,
		path: anchor.path,
		due: null,
		dueTime: null,
		title: "",
	});
}

export function beginRootDraft(path: string, groupKey: string): void {
	setTaskDraft({
		kind: "root",
		path,
		groupKey,
		due: null,
		dueTime: null,
		title: "",
	});
}

function toggleChildrenCollapsed(
	childrenEl: HTMLElement,
	twist: Element | null,
	collapsed: boolean,
): void {
	childrenEl.classList.toggle("is-collapsed", collapsed);
	if (twist instanceof HTMLElement) {
		twist.classList.toggle("is-collapsed", collapsed);
		twist.setAttribute("aria-expanded", String(!collapsed));
	}
}

/**
 * Nested forest with channel guides:
 * each parent’s children live in one `.todo-tree-children` rail (vertical dashed
 * channel); each child row only draws a short horizontal branch to its checkbox.
 */
export function renderTaskForest(options: RenderTaskForestOptions): TaskTreeNode[] {
	const roots = buildTaskTree(options.tasks, {
		linkParentChild: options.linkParentChild,
		byId: options.indexById,
	});

	const draft = getTaskDraft();
	const selectedId = getSelectedTaskId();
	const draftHandlers = options.draftHandlers;
	const showGuides = options.showNestGuideLines;

	const showRootDraft =
		!!draftHandlers &&
		draft?.kind === "root" &&
		(options.groupKey == null || draft.groupKey === options.groupKey);

	if (showRootDraft && draft) {
		renderDraftFor(options.parent, draft, 0, false, draftHandlers!);
	}

	const renderNode = (host: HTMLElement, node: TaskTreeNode): void => {
		const collapsed = collapsedTaskIds.has(node.task.id);
		const childDraftHere =
			!!draftHandlers &&
			draft?.kind === "child" &&
			draft.parentId === node.task.id;
		const hasChildBlock = node.children.length > 0 || childDraftHere;
		const canAddChild =
			!!options.handlers.onAddSubtask &&
			node.task.depth < TASK_MAX_DEPTH &&
			!collapsed;

		const branched = showGuides && node.displayDepth > 0;
		const wrap = el("div", {
			cls: "todo-tree-node",
			parent: host,
			attr: { "data-node-id": node.task.id },
		});
		wrap.style.setProperty(
			"--todo-row-pad",
			`${branched ? TASK_BRANCH_PAD_PX : TASK_ROW_PAD_LEFT_PX}px`,
		);

		let childrenEl: HTMLElement | null = null;

		renderTaskRow(wrap, node.task, options.mode, options.handlers, options.labels, {
			...options.rowOptions,
			hideSource: true,
			selected: selectedId === node.task.id,
			nest: {
				displayDepth: node.displayDepth,
				visibleChildCount:
					node.visibleChildCount > 0
						? node.visibleChildCount
						: childDraftHere
							? 1
							: 0,
				checkState: node.checkState,
				collapsed,
				showGuideLines: showGuides && node.displayDepth > 0,
				addDisabled: !!options.handlers.onAddSubtask && !canAddChild,
				addDisabledReason: collapsed
					? "collapsed"
					: node.task.depth >= TASK_MAX_DEPTH
						? "max-depth"
						: null,
				onToggleCollapse: (task, nextCollapsed) => {
					setTaskCollapsed(task.id, nextCollapsed);
					if (childrenEl) {
						const twist = wrap.querySelector(":scope > .todo-task .todo-task__twist");
						toggleChildrenCollapsed(childrenEl, twist, nextCollapsed);
					}
					/* Intentionally no onNestCollapse → refresh: channel + branch
					   animate with the children container; full re-render would flicker. */
				},
			},
		});

		if (hasChildBlock) {
			childrenEl = el("div", {
				cls: [
					"todo-tree-children",
					showGuides ? "has-guide" : "",
					collapsed ? "is-collapsed" : "",
				],
				parent: wrap,
				attr: { "data-parent-id": node.task.id },
			});
			const inner = el("div", {
				cls: "todo-tree-children__inner",
				parent: childrenEl,
			});

			for (const child of node.children) {
				renderNode(inner, child);
			}

			if (childDraftHere && draft && draftHandlers) {
				renderDraftFor(
					inner,
					draft,
					Math.min(TASK_MAX_DEPTH, node.displayDepth + 1),
					showGuides,
					draftHandlers,
				);
			}
		}

		/** Sibling draft sits at the same level as this node, after its whole subtree. */
		if (
			draftHandlers &&
			draft?.kind === "sibling" &&
			draft.afterId === node.task.id
		) {
			renderDraftFor(
				host,
				draft,
				node.displayDepth,
				showGuides && node.displayDepth > 0,
				draftHandlers,
			);
		}
	};

	for (const root of roots) {
		renderNode(options.parent, root);
	}

	return roots;
}
