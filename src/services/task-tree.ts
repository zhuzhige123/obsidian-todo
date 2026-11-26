import { TASK_MAX_DEPTH } from "../constants";
import type { ParsedTask } from "../types";

export interface TaskRenderNode {
	task: ParsedTask;
	/** Depth relative to the visible forest (parent missing → 0). */
	displayDepth: number;
	/** Direct children present in the visible set. */
	visibleChildCount: number;
	/** Checkbox rollup when parent–child link is on. */
	checkState: "unchecked" | "checked" | "indeterminate";
}

/** Nested tree used by the channel-guide forest renderer. */
export interface TaskTreeNode extends TaskRenderNode {
	children: TaskTreeNode[];
}

/** Document-order walk of a task’s descendants (not including self). */
export function collectDescendantIds(task: ParsedTask, byId: Map<string, ParsedTask>): string[] {
	const out: string[] = [];
	const stack = [...task.childIds].reverse();
	while (stack.length) {
		const id = stack.pop();
		if (!id) continue;
		const child = byId.get(id);
		if (!child) continue;
		out.push(id);
		for (let i = child.childIds.length - 1; i >= 0; i--) {
			const cid = child.childIds[i];
			if (cid) stack.push(cid);
		}
	}
	return out;
}

export function computeCheckState(
	task: ParsedTask,
	byId: Map<string, ParsedTask>,
	linkParentChild: boolean,
): TaskRenderNode["checkState"] {
	if (!linkParentChild || task.childIds.length === 0) {
		return task.completed ? "checked" : "unchecked";
	}
	let checked = 0;
	let total = 0;
	for (const id of task.childIds) {
		const child = byId.get(id);
		if (!child) continue;
		total += 1;
		const state = computeCheckState(child, byId, true);
		if (state === "checked") checked += 1;
		else if (state === "indeterminate") {
			return "indeterminate";
		}
	}
	if (total === 0) return task.completed ? "checked" : "unchecked";
	if (checked === total) return "checked";
	if (checked === 0) return task.completed ? "checked" : "unchecked";
	return "indeterminate";
}

function groupByPath(tasks: ParsedTask[]): Map<string, ParsedTask[]> {
	const byPath = new Map<string, ParsedTask[]>();
	for (const task of tasks) {
		const list = byPath.get(task.path) ?? [];
		list.push(task);
		byPath.set(task.path, list);
	}
	return byPath;
}

/**
 * Nested forest for UI: children always included (collapse is a CSS/DOM state).
 * Missing parents promote the child to a root of the visible set.
 */
export function buildTaskTree(
	tasks: ParsedTask[],
	options: {
		linkParentChild: boolean;
		byId?: Map<string, ParsedTask>;
	},
): TaskTreeNode[] {
	if (!tasks.length) return [];

	const visible = new Set(tasks.map((t) => t.id));
	const byId =
		options.byId ?? new Map(tasks.map((t) => [t.id, t] as const));

	const walk = (task: ParsedTask, displayDepth: number): TaskTreeNode => {
		const depth = Math.min(TASK_MAX_DEPTH, displayDepth);
		const visibleChildren = task.childIds
			.map((id) => byId.get(id))
			.filter((c): c is ParsedTask => !!c && visible.has(c.id));
		return {
			task,
			displayDepth: depth,
			visibleChildCount: visibleChildren.length,
			checkState: computeCheckState(task, byId, options.linkParentChild),
			children: visibleChildren.map((child) => walk(child, depth + 1)),
		};
	};

	const roots: TaskTreeNode[] = [];
	const byPath = groupByPath(tasks);
	const orderedPaths = [...byPath.keys()].sort((a, b) => a.localeCompare(b, "zh"));
	for (const path of orderedPaths) {
		const list = (byPath.get(path) ?? []).slice().sort((a, b) => a.line - b.line);
		for (const task of list) {
			if (task.parentId && visible.has(task.parentId)) continue;
			roots.push(walk(task, 0));
		}
	}
	return roots;
}

/**
 * Flat forest walk (legacy / tests). Honors collapsedIds by omitting descendants.
 */
export function buildVisibleForest(
	tasks: ParsedTask[],
	options: {
		collapsedIds: Set<string>;
		linkParentChild: boolean;
		byId?: Map<string, ParsedTask>;
	},
): TaskRenderNode[] {
	const tree = buildTaskTree(tasks, options);
	const nodes: TaskRenderNode[] = [];

	const walk = (node: TaskTreeNode): void => {
		nodes.push({
			task: node.task,
			displayDepth: node.displayDepth,
			visibleChildCount: node.visibleChildCount,
			checkState: node.checkState,
		});
		if (options.collapsedIds.has(node.task.id)) return;
		for (const child of node.children) walk(child);
	};

	for (const root of tree) walk(root);
	return nodes;
}
