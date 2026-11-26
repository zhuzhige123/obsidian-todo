/** Session UI state for the task forest (survives re-renders, not disk). */

export interface TaskDraftBase {
	due: string | null;
	dueTime: string | null;
	/** In-progress title kept across re-renders. */
	title: string;
}

export type TaskDraft =
	| (TaskDraftBase & {
			kind: "child";
			parentId: string;
			path: string;
	  })
	| (TaskDraftBase & {
			kind: "sibling";
			afterId: string;
			path: string;
	  })
	| (TaskDraftBase & {
			kind: "root";
			path: string;
			/** Group collapse key; used to re-attach draft in the right group. */
			groupKey: string;
	  });

let draft: TaskDraft | null = null;
let selectedTaskId: string | null = null;
let focusDraftPending = false;
/** Parents auto-folded by the check-motion chain (not manual twist). */
const autoCollapsedByCheck = new Set<string>();

export function getTaskDraft(): TaskDraft | null {
	return draft;
}

export function setTaskDraft(next: TaskDraft | null): void {
	draft = next;
	if (next) focusDraftPending = true;
}

export function updateTaskDraftDue(due: string | null, dueTime: string | null = null): void {
	if (!draft) return;
	draft = {
		...draft,
		due,
		dueTime: due ? dueTime : null,
	};
}

export function updateTaskDraftTitle(title: string): void {
	if (!draft) return;
	draft = { ...draft, title };
}

export function clearTaskDraft(): void {
	draft = null;
	focusDraftPending = false;
}

export function consumeFocusDraft(): boolean {
	if (!focusDraftPending) return false;
	focusDraftPending = false;
	return true;
}

export function getSelectedTaskId(): string | null {
	return selectedTaskId;
}

export function setSelectedTaskId(id: string | null): void {
	selectedTaskId = id;
}

export function markAutoCollapsedByCheck(taskId: string): void {
	autoCollapsedByCheck.add(taskId);
}

export function clearAutoCollapsedByCheck(taskId: string): void {
	autoCollapsedByCheck.delete(taskId);
}

export function isAutoCollapsedByCheck(taskId: string): boolean {
	return autoCollapsedByCheck.has(taskId);
}
