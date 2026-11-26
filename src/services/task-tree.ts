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

/**
 * Order tasks as a forest for UI: keep siblings in line order, nest children
 * under parents when both are in the visible set; otherwise promote to root.
 */
export function buildVisibleForest(
	tasks: ParsedTask[],
	options: {
		collapsedIds: Set<string>;
		linkParentChild: boolean;
		byId?: Map<string, ParsedTask>;
	},
): TaskRenderNode[] {
	if (!tasks.length) return [];

	const visible = new Set(tasks.map((t) => t.id));
	const byId =
		options.byId ??
		new Map(tasks.flatMap((t) => {
			// Prefer full index map when provided; fall back to visible only.
			return [[t.id, t] as const];
		}));

	const byPath = new Map<string, ParsedTask[]>();
	for (const task of tasks) {
		const list = byPath.get(task.path) ?? [];
		list.push(task);
		byPath.set(task.path, list);
	}

	const nodes: TaskRenderNode[] = [];

	const walk = (task: ParsedTask, displayDepth: number): void => {
		const depth = Math.min(TASK_MAX_DEPTH, displayDepth);
		const visibleChildren = task.childIds
			.map((id) => byId.get(id))
			.filter((c): c is ParsedTask => !!c && visible.has(c.id));
		nodes.push({
			task,
			displayDepth: depth,
			visibleChildCount: visibleChildren.length,
			checkState: computeCheckState(task, byId, options.linkParentChild),
		});
		if (options.collapsedIds.has(task.id)) return;
		for (const child of visibleChildren) {
			walk(child, depth + 1);
		}
	};

	const paths = [...byPath.keys()].sort((a, b) => a.localeCompare(b, "zh"));
	for (const path of paths) {
		const list = (byPath.get(path) ?? []).slice().sort((a, b) => a.line - b.line);
		const roots = list.filter((t) => !t.parentId || !visible.has(t.parentId));
		for (const root of roots) walk(root, 0);
	}

	return nodes;
}
