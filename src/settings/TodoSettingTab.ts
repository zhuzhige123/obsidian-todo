import { Notice, PluginSettingTab, Setting, setIcon, type App } from "obsidian";
import type TodoPlugin from "../main";
import { LOCALE_IDS, LOCALE_LABELS, type LocalePreference } from "../i18n";
import {
	FolderSuggest,
	commitExcludedFolder,
	resolveVaultFolder,
} from "../ui/folder-suggest";

export class TodoSettingTab extends PluginSettingTab {
	plugin: TodoPlugin;

	constructor(app: App, plugin: TodoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const t = (key: Parameters<TodoPlugin["t"]>[0], vars?: Record<string, string | number>) =>
			this.plugin.t(key, vars);
		const settings = this.plugin.data.settings;

		containerEl.createEl("h2", { text: t("pluginName") });

		new Setting(containerEl)
			.setName(t("settingsLanguage"))
			.setDesc(t("settingsLanguageDesc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("auto", t("settingsLanguageAuto"));
				for (const id of LOCALE_IDS) {
					dropdown.addOption(id, LOCALE_LABELS[id]);
				}
				dropdown.setValue(settings.locale);
				dropdown.onChange(async (value) => {
					settings.locale = value as LocalePreference;
					await this.plugin.savePluginData();
					this.plugin.refreshOpenViews();
					this.display();
				});
			});

		containerEl.createEl("h3", { text: t("settingsExclude") });
		new Setting(containerEl).setName(t("settingsExclude")).setDesc(t("settingsExcludeDesc"));
		this.renderExcludedFolders(containerEl);
	}

	private renderExcludedFolders(containerEl: HTMLElement): void {
		const t = (key: Parameters<TodoPlugin["t"]>[0], vars?: Record<string, string | number>) =>
			this.plugin.t(key, vars);
		const settings = this.plugin.data.settings;
		const host = containerEl.createDiv({ cls: "todo-excluded-folders" });

		const persist = async (folders: string[]) => {
			settings.excludeFolders = folders;
			await this.plugin.savePluginData();
			this.plugin.taskIndex.setExcludeFolders(folders);
			new Notice(t("settingsExcludeApply"), 2500);
			void this.plugin.taskIndex.rebuild();
			this.display();
		};

		if (!settings.excludeFolders.length) {
			host.createEl("p", {
				cls: "todo-excluded-folders__empty",
				text: t("settingsExcludeEmpty"),
			});
		} else {
			const list = host.createDiv({
				cls: "todo-excluded-folders__list",
				attr: { role: "list", "aria-label": t("settingsExclude") },
			});
			for (const folder of settings.excludeFolders) {
				const row = list.createDiv({
					cls: "todo-excluded-folders__row setting-item",
					attr: { role: "listitem" },
				});
				row.createSpan({
					cls: "todo-excluded-folders__path",
					text: folder,
					attr: { title: folder },
				});
				const remove = row.createEl("button", {
					cls: "clickable-icon todo-excluded-folders__remove",
					attr: {
						type: "button",
						"aria-label": `${t("settingsExcludeRemove")} ${folder}`,
					},
				});
				setIcon(remove, "trash");
				remove.addEventListener("click", () => {
					void persist(settings.excludeFolders.filter((item) => item !== folder));
				});
			}
		}

		const addRow = host.createDiv({ cls: "todo-excluded-folders__add-row setting-item" });
		const input = addRow.createEl("input", {
			cls: "todo-excluded-folders__input",
			attr: {
				type: "text",
				placeholder: t("settingsExcludePlaceholder"),
				spellcheck: "false",
				"aria-label": t("settingsExcludePlaceholder"),
			},
		});
		const addBtn = addRow.createEl("button", {
			cls: "mod-cta todo-excluded-folders__add",
			text: t("settingsExcludeAdd"),
			attr: { type: "button" },
		});

		const suggest = new FolderSuggest(
			this.app,
			input,
			() => settings.excludeFolders,
			(folder) => {
				input.value = folder.path;
			},
		);

		const addFolder = async () => {
			const typed = suggest.getValue() || input.value;
			const folder = resolveVaultFolder(this.app, typed);
			if (!folder) {
				new Notice(
					typed.trim() ? t("settingsExcludeErrorMissing") : t("settingsExcludeErrorEmpty"),
				);
				return;
			}
			const result = commitExcludedFolder(settings.excludeFolders, folder.path);
			if (result.status === "duplicate") {
				new Notice(t("settingsExcludeErrorDuplicate"));
				return;
			}
			if (result.status === "covered") {
				new Notice(t("settingsExcludeErrorCovered", { folder: result.by }));
				return;
			}
			if (result.status !== "added") {
				new Notice(t("settingsExcludeErrorEmpty"));
				return;
			}
			suggest.close();
			input.value = "";
			await persist(result.folders);
		};

		input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.isComposing) return;
			if (suggest.isChooserOpen()) return;
			event.preventDefault();
			void addFolder();
		});
		addBtn.addEventListener("mousedown", (event) => event.preventDefault());
		addBtn.addEventListener("click", () => {
			void addFolder();
		});
	}
}
