import type { App } from "obsidian";
import { Notice, TFile } from "obsidian";
import type { ParsedTask } from "../types";
import { toggleTaskLineCompleted } from "./task-parser";
import { toLocalDateKey } from "../utils/dates";

export async function setTaskCompleted(
	app: App,
	task: ParsedTask,
	completed: boolean,
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
			const current = lines[task.line] ?? "";
			let next = toggleTaskLineCompleted(current, completed);
			if (completed && !/✅\s*\d{4}-\d{2}-\d{2}/.test(next)) {
				next = `${next.trimEnd()} ✅ ${toLocalDateKey()}`;
			}
			if (!completed) {
				next = next.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, "");
			}
			lines[task.line] = next;
			return lines.join("\n");
		});
		return true;
	} catch (error) {
		console.error(error);
		new Notice("完成状态写入失败");
		return false;
	}
}
