import {
	Plugin,
	TFile,
	type TAbstractFile,
} from "obsidian";
import {
	createDefaultData,
	isSidebarTab,
	normalizeSettings,
	type TodoPluginData,
} from "./types";
import { resolveLocale, t as translate, type MessageKey } from "./i18n";
import { toLocalDateKey } from "./utils/dates";
import { TaskIndex } from "./services/task-index";
import { MyDayStore } from "./services/my-day-store";
import { TodoSidebarView, TODO_SIDEBAR_VIEW_TYPE } from "./views/TodoSidebarView";
import { TodoSettingTab } from "./settings/TodoSettingTab";

export default class TodoPlugin extends Plugin {
	data: TodoPluginData = createDefaultData(toLocalDateKey());
	taskIndex = new TaskIndex(this.app);
	myDay = new MyDayStore(this.data);

	async onload(): Promise<void> {
		await this.loadPluginData();
		this.taskIndex.setExcludeFolders(this.data.settings.excludeFolders);
		this.myDay.replaceData(this.data);

		this.registerView(
			TODO_SIDEBAR_VIEW_TYPE,
			(leaf) => new TodoSidebarView(leaf, this),
		);

		this.addSettingTab(new TodoSettingTab(this.app, this));

		this.addRibbonIcon("check-square", this.t("openSidebar"), () => {
			void this.activateSidebar();
		});

		this.addCommand({
			id: "open-todo-sidebar",
			name: this.t("commandOpenSidebar"),
			callback: () => {
				void this.activateSidebar();
			},
		});

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile) void this.taskIndex.refreshFile(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile) void this.taskIndex.refreshFile(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.taskIndex.removePath(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				this.taskIndex.handleRename(file, oldPath);
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.bootstrapIndex();
		});
	}

	onunload(): void {
		// Views are detached by Obsidian.
	}

	t(key: MessageKey, vars?: Record<string, string | number>): string {
		return translate(resolveLocale(this.data.settings.locale), key, vars);
	}

	refreshOpenViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(TODO_SIDEBAR_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof TodoSidebarView) view.reloadFromSettings();
		}
	}

	private async bootstrapIndex(): Promise<void> {
		window.setTimeout(() => {
			void this.taskIndex.rebuild();
		}, 0);
	}

	async loadPluginData(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<TodoPluginData> | null;
		const today = toLocalDateKey();
		const settings = normalizeSettings(loaded?.settings);
		let lastTab: TodoPluginData["lastTab"] = isSidebarTab(loaded?.lastTab)
			? loaded.lastTab
			: "suggest";
		if (lastTab === "stats" && settings.showStatsTab === false) lastTab = "suggest";
		if (lastTab === "list" && settings.showListTab === false) lastTab = "suggest";

		this.data = {
			...createDefaultData(today),
			...(loaded ?? {}),
			settings,
			myDayDate: loaded?.myDayDate ?? today,
			myDayIds: Array.isArray(loaded?.myDayIds) ? loaded.myDayIds : [],
			lastTab,
		};
		this.myDay.replaceData(this.data);
	}

	async savePluginData(): Promise<void> {
		await this.saveData(this.data);
	}

	async activateSidebar(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TODO_SIDEBAR_VIEW_TYPE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]!);
			return;
		}
		const leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: TODO_SIDEBAR_VIEW_TYPE, active: true });
		workspace.revealLeaf(leaf);
	}
}
