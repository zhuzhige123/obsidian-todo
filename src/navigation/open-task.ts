import type { App } from "obsidian";
import { MarkdownView, Notice } from "obsidian";
import type { ParsedTask } from "../types";

/** Open note and select the task line (source / live preview). */
export async function openTaskAtLine(app: App, task: ParsedTask): Promise<void> {
	const file = app.vault.getAbstractFileByPath(task.path);
	if (!file || !("extension" in file)) {
		new Notice("找不到任务所在笔记");
		return;
	}

	const leaf = app.workspace.getLeaf(false);
	await leaf.openFile(file as Parameters<typeof leaf.openFile>[0], { active: true });

	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) return;

	const editor = view.editor;
	const line = Math.max(0, Math.min(task.line, editor.lineCount() - 1));
	const lineText = editor.getLine(line);
	editor.setSelection({ line, ch: 0 }, { line, ch: lineText.length });
	editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: lineText.length } }, true);
}
