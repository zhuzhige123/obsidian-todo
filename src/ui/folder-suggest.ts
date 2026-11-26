import { AbstractInputSuggest, TFolder, type App } from "obsidian";

export function normalizeFolderPath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/\/$/, "");
}

export function resolveVaultFolder(app: App, rawPath: string): TFolder | null {
	const normalized = normalizeFolderPath(rawPath);
	if (!normalized || normalized === "/") return null;
	const direct = app.vault.getAbstractFileByPath(normalized);
	if (direct instanceof TFolder && !direct.isRoot()) return direct;
	const needle = normalized.toLowerCase();
	for (const abstract of app.vault.getAllLoadedFiles()) {
		if (!(abstract instanceof TFolder) || abstract.isRoot()) continue;
		if (abstract.path.toLowerCase() === needle) return abstract;
	}
	return null;
}

function isExcludedOrCovered(path: string, excluded: string[]): boolean {
	const key = normalizeFolderPath(path).toLowerCase();
	if (!key) return false;
	for (const folder of excluded) {
		const folderKey = normalizeFolderPath(folder).toLowerCase();
		if (!folderKey) continue;
		if (key === folderKey || key.startsWith(`${folderKey}/`)) return true;
	}
	return false;
}

export type CommitExcludeResult =
	| { status: "added"; folders: string[] }
	| { status: "duplicate" }
	| { status: "covered"; by: string }
	| { status: "empty" };

export function commitExcludedFolder(current: string[], rawPath: string): CommitExcludeResult {
	const normalized = normalizeFolderPath(rawPath);
	if (!normalized) return { status: "empty" };
	const key = normalized.toLowerCase();
	for (const folder of current) {
		const folderKey = normalizeFolderPath(folder).toLowerCase();
		if (folderKey === key) return { status: "duplicate" };
		if (key.startsWith(`${folderKey}/`)) return { status: "covered", by: folder };
	}
	return {
		status: "added",
		folders: [...current, normalized].sort((a, b) => a.localeCompare(b, "zh")),
	};
}

/** Folder path autocomplete for excluded-folder settings inputs. */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private chooserOpen = false;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly excludedPaths: () => string[],
		private readonly onPick: (folder: TFolder) => void,
	) {
		super(app, inputEl);
	}

	isChooserOpen(): boolean {
		return this.chooserOpen;
	}

	protected getSuggestions(query: string): TFolder[] {
		const needle = query.trim().toLowerCase();
		const folders: TFolder[] = [];
		for (const abstract of this.app.vault.getAllLoadedFiles()) {
			if (!(abstract instanceof TFolder) || abstract.isRoot()) continue;
			if (isExcludedOrCovered(abstract.path, this.excludedPaths())) continue;
			if (!needle || abstract.path.toLowerCase().includes(needle)) folders.push(abstract);
		}
		folders.sort((a, b) => a.path.localeCompare(b.path));
		this.chooserOpen = folders.length > 0;
		return folders.slice(0, 50);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		evt.preventDefault();
		this.setValue(folder.path);
		this.onPick(folder);
		this.close();
	}

	override close(): void {
		this.chooserOpen = false;
		super.close();
	}
}
