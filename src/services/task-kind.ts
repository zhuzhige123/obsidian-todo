import type { ParsedTask } from "../types";
import { noteDisplayName } from "../utils/note-path";

export type TaskVisualKind = "normal" | "bug";

const BUG_PATH_RE = /待解决问题|bugs?|issues?/i;
const BUG_TAG_RE = /^#(bug|issue|问题|缺陷)$/i;

function isBugTask(task: ParsedTask): boolean {
	if (BUG_PATH_RE.test(noteDisplayName(task.path))) return true;
	return task.tags.some((tag) => BUG_TAG_RE.test(tag));
}

/** Visual hint for list rows. Bug notes get a faint warning mark only. */
export function getTaskVisualKind(task: ParsedTask): TaskVisualKind {
	if (isBugTask(task)) return "bug";
	return "normal";
}
