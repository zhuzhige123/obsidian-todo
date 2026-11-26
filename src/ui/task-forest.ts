import type { ParsedTask } from "../types";
import { buildVisibleForest, type TaskRenderNode } from "../services/task-tree";
import { renderTaskRow, type TaskRowHandlers, type TaskRowLabels, type TaskRowMode, type TaskRowOptions } from "./task-row";

/** Session-persistent collapse state for nested task parents. */
const collapsedTaskIds = new Set<string>();

export function isTaskCollapsed(taskId: string): boolean {
	return collapsedTaskIds.has(taskId);
}

export function setTaskCollapsed(taskId: string, collapsed: boolean): void {
	if (collapsed) collapsedTaskIds.add(taskId);
	else collapsedTaskIds.delete(taskId);
}

export interface RenderTaskForestOptions {
	parent: HTMLElement;
	tasks: ParsedTask[];
	/** Full file index for accurate check rollup / child lookup across filters. */
	indexById?: Map<string, ParsedTask>;
	mode: TaskRowMode;
	handlers: TaskRowHandlers;
	labels: TaskRowLabels;
	rowOptions?: TaskRowOptions;
	linkParentChild: boolean;
	showNestGuideLines: boolean;
}

/** Render a flat list of tasks as an indented / collapsible forest. */
export function renderTaskForest(options: RenderTaskForestOptions): TaskRenderNode[] {
	const nodes = buildVisibleForest(options.tasks, {
		collapsedIds: collapsedTaskIds,
		linkParentChild: options.linkParentChild,
		byId: options.indexById,
	});

	for (const node of nodes) {
		renderTaskRow(options.parent, node.task, options.mode, options.handlers, options.labels, {
			...options.rowOptions,
			hideSource: true,
			nest: {
				displayDepth: node.displayDepth,
				visibleChildCount: node.visibleChildCount,
				checkState: node.checkState,
				collapsed: collapsedTaskIds.has(node.task.id),
				showGuideLines: options.showNestGuideLines,
				onToggleCollapse: (task, collapsed) => {
					setTaskCollapsed(task.id, collapsed);
					// Re-render is owned by the caller via handler refresh.
					options.handlers.onNestCollapse?.(task, collapsed);
				},
			},
		});
	}

	return nodes;
}
