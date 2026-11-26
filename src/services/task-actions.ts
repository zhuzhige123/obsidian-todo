import type { App } from "obsidian";
import { Notice, TFile } from "obsidian";
import type { ParsedTask } from "../types";
import { childIndentPrefix, toggleTaskLineCompleted } from "./task-parser";
import { collectDescendantIds } from "./task-tree";
import { toLocalDateKey } from "../utils/dates";

function applyCompletedMarkers(line: string, completed: boolean): string {
	let next = toggleTaskLineCompleted(line, completed);
	if (completed && !/✅\s*\d{4}-\d{2}-\d{2}/.test(next)) {
		next = `${next.trimEnd()} ✅ ${toLocalDateKey()}`;
	}
	if (!completed) {
		next = next.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, "");
	}
	return next;
}

export async function setTaskCompleted(
	app: App,
	task: ParsedTask,
	completed: boolean,
	options?: {
		linkParentChild?: boolean;
		fileTasks?: ParsedTask[];
	},
): Promise<boolean> {
	const abstract = app.vault.getAbstractFileByPath(task.path);
	if (!(abstract instanceof TFile)) {
		new Notice("无法写入：文件不存在");
		return false;
	}

	const link = options?.linkParentChild === true;
	const fileTasks = options?.fileTasks ?? [];
	const byId = new Map(fileTasks.map((t) => [t.id, t]));

	try {
		await app.vault.process(abstract, (content) => {
			const lines = content.split(/\r?\n/);
			/** line → intended completed */
			const intended = new Map<number, boolean>();

			const mark = (t: ParsedTask, value: boolean): void => {
				intended.set(t.line, value);
			};

			mark(task, completed);
			if (link && fileTasks.length) {
				for (const id of collectDescendantIds(task, byId)) {
					const child = byId.get(id);
					if (child) mark(child, completed);
				}

				const isComplete = (t: ParsedTask): boolean =>
					intended.has(t.line) ? Boolean(intended.get(t.line)) : t.completed;

				let parentId = task.parentId;
				while (parentId) {
					const parent = byId.get(parentId);
					if (!parent) break;
					const kids = parent.childIds
						.map((id) => byId.get(id))
						.filter((c): c is ParsedTask => !!c);
					if (kids.length && kids.every(isComplete)) mark(parent, true);
					else mark(parent, false);
					parentId = parent.parentId;
				}
			}

			for (const [line, value] of intended) {
				if (line < 0 || line >= lines.length) continue;
				lines[line] = applyCompletedMarkers(lines[line] ?? "", value);
			}
			return lines.join("\n");
		});
		return true;
	} catch (error) {
		console.error(error);
		new Notice("完成状态写入失败");
		return false;
	}
}

/** Insert a child task under `parent` (after its last descendant) and return the new line. */
export async function insertSubtask(
	app: App,
	parent: ParsedTask,
	title: string,
	fileTasks: ParsedTask[],
): Promise<{ line: number; path: string } | null> {
	const abstract = app.vault.getAbstractFileByPath(parent.path);
	if (!(abstract instanceof TFile)) {
		new Notice("无法写入：文件不存在");
		return null;
	}

	const trimmed = title.trim();
	if (!trimmed) {
		new Notice("子任务标题不能为空");
		return null;
	}

	const byId = new Map(fileTasks.map((t) => [t.id, t]));
	const descendants = collectDescendantIds(parent, byId)
		.map((id) => byId.get(id))
		.filter((t): t is ParsedTask => !!t);
	const insertAfterLine =
		descendants.length > 0
			? Math.max(...descendants.map((t) => t.line))
			: parent.line;

	const indent = childIndentPrefix(parent.raw);
	const newLine = `${indent}- [ ] ${trimmed}`;
	let writtenAt = insertAfterLine + 1;

	try {
		await app.vault.process(abstract, (content) => {
			const lines = content.split(/\r?\n/);
			const at = Math.min(Math.max(insertAfterLine + 1, 0), lines.length);
			writtenAt = at;
			lines.splice(at, 0, newLine);
			return lines.join("\n");
		});
		return { line: writtenAt, path: parent.path };
	} catch (error) {
		console.error(error);
		new Notice("新增子任务失败");
		return null;
	}
}
