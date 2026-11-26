import type { App } from "obsidian";
import { Notice, TFile } from "obsidian";
import { TASK_MAX_DEPTH } from "../constants";
import type { ParsedTask } from "../types";
import {
	applyDueToTaskLine,
	buildTaskMarkdownLine,
	childIndentPrefix,
	lineIndentPrefix,
	shiftLineIndent,
	toggleTaskLineCompleted,
} from "./task-parser";
import { collectDescendantIds } from "./task-tree";
import { toLocalDateKey } from "../utils/dates";

export type TaskWriteResult = { line: number; path: string };

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

async function writeInsert(
	app: App,
	path: string,
	insertAfterLine: number,
	newLine: string,
): Promise<TaskWriteResult | null> {
	const abstract = app.vault.getAbstractFileByPath(path);
	if (!(abstract instanceof TFile)) {
		new Notice("无法写入：文件不存在");
		return null;
	}
	let writtenAt = insertAfterLine + 1;
	try {
		await app.vault.process(abstract, (content) => {
			const lines = content.split(/\r?\n/);
			const at = Math.min(Math.max(insertAfterLine + 1, 0), lines.length);
			writtenAt = at;
			lines.splice(at, 0, newLine);
			return lines.join("\n");
		});
		return { line: writtenAt, path };
	} catch (error) {
		console.error(error);
		return null;
	}
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

/** Insert a child task under `parent` (after its last descendant). */
export async function insertSubtask(
	app: App,
	parent: ParsedTask,
	title: string,
	fileTasks: ParsedTask[],
	due: string | null = null,
	dueTime: string | null = null,
): Promise<TaskWriteResult | null> {
	const trimmed = title.trim();
	if (!trimmed) {
		new Notice("子任务标题不能为空");
		return null;
	}
	if (parent.depth >= TASK_MAX_DEPTH) {
		new Notice("已达最大嵌套层级");
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

	const newLine = buildTaskMarkdownLine(
		childIndentPrefix(parent.raw),
		trimmed,
		due,
		dueTime,
	);
	const result = await writeInsert(app, parent.path, insertAfterLine, newLine);
	if (!result) new Notice("新增子任务失败");
	return result;
}

/** Insert a sibling task after `anchor` (and its descendants), same indent. */
export async function insertSiblingTask(
	app: App,
	anchor: ParsedTask,
	title: string,
	fileTasks: ParsedTask[],
	due: string | null = null,
	dueTime: string | null = null,
): Promise<TaskWriteResult | null> {
	const trimmed = title.trim();
	if (!trimmed) {
		new Notice("任务标题不能为空");
		return null;
	}

	const byId = new Map(fileTasks.map((t) => [t.id, t]));
	const descendants = collectDescendantIds(anchor, byId)
		.map((id) => byId.get(id))
		.filter((t): t is ParsedTask => !!t);
	const insertAfterLine =
		descendants.length > 0
			? Math.max(...descendants.map((t) => t.line))
			: anchor.line;

	const newLine = buildTaskMarkdownLine(
		lineIndentPrefix(anchor.raw),
		trimmed,
		due,
		dueTime,
	);
	const result = await writeInsert(app, anchor.path, insertAfterLine, newLine);
	if (!result) new Notice("新增任务失败");
	return result;
}

/** Insert a root-level task at the end of the file’s existing tasks (or EOF). */
export async function insertRootTask(
	app: App,
	path: string,
	title: string,
	fileTasks: ParsedTask[],
	due: string | null = null,
	dueTime: string | null = null,
): Promise<TaskWriteResult | null> {
	const trimmed = title.trim();
	if (!trimmed) {
		new Notice("任务标题不能为空");
		return null;
	}

	const sameFile = fileTasks.filter((t) => t.path === path);
	const insertAfterLine =
		sameFile.length > 0 ? Math.max(...sameFile.map((t) => t.line)) : -1;
	const newLine = buildTaskMarkdownLine("", trimmed, due, dueTime);
	const result = await writeInsert(app, path, insertAfterLine, newLine);
	if (!result) new Notice("新增任务失败");
	return result;
}

/** Update 📅 due (+ optional time) on an existing task line. */
export async function setTaskDue(
	app: App,
	task: ParsedTask,
	due: string | null,
	dueTime: string | null = null,
): Promise<boolean> {
	const abstract = app.vault.getAbstractFileByPath(task.path);
	if (!(abstract instanceof TFile)) {
		new Notice("无法写入：文件不存在");
		return false;
	}
	try {
		await app.vault.process(abstract, (content) => {
			const lines = content.split(/\r?\n/);
			if (task.line < 0 || task.line >= lines.length) return content;
			lines[task.line] = applyDueToTaskLine(lines[task.line] ?? "", due, dueTime);
			return lines.join("\n");
		});
		return true;
	} catch (error) {
		console.error(error);
		new Notice("截止日期写入失败");
		return false;
	}
}

function previousSibling(
	task: ParsedTask,
	fileTasks: ParsedTask[],
): ParsedTask | null {
	const byId = new Map(fileTasks.map((t) => [t.id, t]));
	if (task.parentId) {
		const parent = byId.get(task.parentId);
		if (!parent) return null;
		const idx = parent.childIds.indexOf(task.id);
		if (idx <= 0) return null;
		const prevId = parent.childIds[idx - 1];
		return prevId ? (byId.get(prevId) ?? null) : null;
	}
	const roots = fileTasks
		.filter((t) => !t.parentId)
		.slice()
		.sort((a, b) => a.line - b.line);
	const idx = roots.findIndex((t) => t.id === task.id);
	if (idx <= 0) return null;
	return roots[idx - 1] ?? null;
}

/** Tab: nest under the previous sibling. */
export async function indentTask(
	app: App,
	task: ParsedTask,
	fileTasks: ParsedTask[],
): Promise<boolean> {
	if (task.depth >= TASK_MAX_DEPTH) {
		new Notice("已达最大嵌套层级");
		return false;
	}
	const prev = previousSibling(task, fileTasks);
	if (!prev) return false;

	const abstract = app.vault.getAbstractFileByPath(task.path);
	if (!(abstract instanceof TFile)) {
		new Notice("无法写入：文件不存在");
		return false;
	}

	const byId = new Map(fileTasks.map((t) => [t.id, t]));
	const block = [task, ...collectDescendantIds(task, byId).map((id) => byId.get(id)).filter((t): t is ParsedTask => !!t)];
	const delta = 2;

	try {
		await app.vault.process(abstract, (content) => {
			const lines = content.split(/\r?\n/);
			for (const t of block) {
				if (t.line < 0 || t.line >= lines.length) continue;
				lines[t.line] = shiftLineIndent(lines[t.line] ?? "", delta);
			}
			return lines.join("\n");
		});
		return true;
	} catch (error) {
		console.error(error);
		new Notice("缩进失败");
		return false;
	}
}

/** Shift+Tab: promote one level (become sibling of current parent). */
export async function outdentTask(
	app: App,
	task: ParsedTask,
	fileTasks: ParsedTask[],
): Promise<boolean> {
	if (!task.parentId || task.indent <= 0) return false;

	const abstract = app.vault.getAbstractFileByPath(task.path);
	if (!(abstract instanceof TFile)) {
		new Notice("无法写入：文件不存在");
		return false;
	}

	const byId = new Map(fileTasks.map((t) => [t.id, t]));
	const parent = byId.get(task.parentId);
	if (!parent) return false;

	const delta = parent.indent - task.indent;
	if (delta >= 0) return false;

	const block = [task, ...collectDescendantIds(task, byId).map((id) => byId.get(id)).filter((t): t is ParsedTask => !!t)];

	try {
		await app.vault.process(abstract, (content) => {
			const lines = content.split(/\r?\n/);
			for (const t of block) {
				if (t.line < 0 || t.line >= lines.length) continue;
				lines[t.line] = shiftLineIndent(lines[t.line] ?? "", delta);
			}
			return lines.join("\n");
		});
		return true;
	} catch (error) {
		console.error(error);
		new Notice("取消缩进失败");
		return false;
	}
}
