import type { ParsedTask } from "../types";
import { getSelectedTaskId, getTaskDraft } from "./task-session";

export interface TaskListKeyHandlers {
	getTaskById: (id: string) => ParsedTask | undefined;
	onIndent: (task: ParsedTask) => void;
	onOutdent: (task: ParsedTask) => void;
	onAddSibling: (task: ParsedTask) => void;
	onAddChild: (task: ParsedTask) => void;
	onCancelDraft: () => void;
	/** Space — toggle complete with the same motion chain as clicking the checkbox. */
	onToggleComplete?: (task: ParsedTask) => void;
}

/**
 * Tab / Shift+Tab / Ctrl+Enter / Ctrl+Shift+Enter / Esc for the task list host.
 * Ignores events while typing in inputs (draft row owns Enter/Esc there).
 */
export function bindTaskListKeys(
	host: HTMLElement,
	handlers: TaskListKeyHandlers,
): () => void {
	const onKeyDown = (event: KeyboardEvent): void => {
		const target = event.target;
		if (target instanceof HTMLElement) {
			const tag = target.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
				return;
			}
		}

		const selectedId = getSelectedTaskId();
		const selected = selectedId ? handlers.getTaskById(selectedId) : undefined;
		const mod = event.ctrlKey || event.metaKey;

		if (event.key === "Escape" && getTaskDraft()) {
			event.preventDefault();
			handlers.onCancelDraft();
			return;
		}

		if (!selected) return;

		if (event.key === " " || event.key === "Spacebar") {
			event.preventDefault();
			handlers.onToggleComplete?.(selected);
			return;
		}

		if (event.key === "Tab" && !mod) {
			event.preventDefault();
			if (event.shiftKey) handlers.onOutdent(selected);
			else handlers.onIndent(selected);
			return;
		}

		if (event.key === "Enter" && mod) {
			event.preventDefault();
			if (event.shiftKey) handlers.onAddChild(selected);
			else handlers.onAddSibling(selected);
		}
	};

	host.addEventListener("keydown", onKeyDown);
	return () => host.removeEventListener("keydown", onKeyDown);
}
