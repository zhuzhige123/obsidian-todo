import type { App, TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import type { ParsedTask } from "../types";
import { parseTasksInMarkdown } from "./task-parser";
import { yieldToMainThread } from "../utils/yield-main";

const BATCH_SIZE = 24;

export type TaskIndexListener = () => void;

export class TaskIndex {
	private readonly app: App;
	private readonly tasksById = new Map<string, ParsedTask>();
	private readonly tasksByPath = new Map<string, ParsedTask[]>();
	private readonly listeners = new Set<TaskIndexListener>();
	private excludeFolders: string[] = [];
	private scanning = false;
	private scanToken = 0;

	constructor(app: App) {
		this.app = app;
	}

	setExcludeFolders(folders: string[]): void {
		this.excludeFolders = folders.map((f) => f.replace(/\\/g, "/").replace(/\/$/, ""));
	}

	onChange(listener: TaskIndexListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}

	getAll(): ParsedTask[] {
		return [...this.tasksById.values()];
	}

	getById(id: string): ParsedTask | undefined {
		return this.tasksById.get(id);
	}

	getOpenTasks(): ParsedTask[] {
		return this.getAll().filter((t) => !t.completed);
	}

	private isExcluded(path: string): boolean {
		const normalized = path.replace(/\\/g, "/");
		return this.excludeFolders.some(
			(folder) => normalized === folder || normalized.startsWith(`${folder}/`),
		);
	}

	async rebuild(): Promise<void> {
		const token = ++this.scanToken;
		this.scanning = true;
		const nextById = new Map<string, ParsedTask>();
		const nextByPath = new Map<string, ParsedTask[]>();

		const files = this.app.vault.getMarkdownFiles().filter((f) => !this.isExcluded(f.path));
		for (let i = 0; i < files.length; i++) {
			if (token !== this.scanToken) return;
			const file = files[i];
			if (!file) continue;
			try {
				const content = await this.app.vault.cachedRead(file);
				const tasks = parseTasksInMarkdown(file.path, content);
				if (tasks.length) {
					nextByPath.set(file.path, tasks);
					for (const task of tasks) nextById.set(task.id, task);
				}
			} catch {
				// Skip unreadable files; keep scanning.
			}
			if ((i + 1) % BATCH_SIZE === 0) await yieldToMainThread();
		}

		if (token !== this.scanToken) return;
		this.tasksById.clear();
		this.tasksByPath.clear();
		for (const [id, task] of nextById) this.tasksById.set(id, task);
		for (const [path, list] of nextByPath) this.tasksByPath.set(path, list);
		this.scanning = false;
		this.emit();
	}

	async refreshFile(file: TFile): Promise<void> {
		if (file.extension !== "md") return;
		if (this.isExcluded(file.path)) {
			this.removePath(file.path);
			return;
		}
		try {
			const content = await this.app.vault.cachedRead(file);
			const tasks = parseTasksInMarkdown(file.path, content);
			this.removePath(file.path, false);
			if (tasks.length) {
				this.tasksByPath.set(file.path, tasks);
				for (const task of tasks) this.tasksById.set(task.id, task);
			}
			this.emit();
		} catch {
			// ignore
		}
	}

	removePath(path: string, emitChange = true): void {
		const existing = this.tasksByPath.get(path);
		if (!existing) return;
		for (const task of existing) this.tasksById.delete(task.id);
		this.tasksByPath.delete(path);
		if (emitChange) this.emit();
	}

	handleRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFile) || file.extension !== "md") {
			this.removePath(oldPath);
			return;
		}
		const existing = this.tasksByPath.get(oldPath);
		if (!existing) {
			void this.refreshFile(file);
			return;
		}
		this.removePath(oldPath, false);
		void this.refreshFile(file);
	}

	isScanning(): boolean {
		return this.scanning;
	}
}
