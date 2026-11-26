import {
	isLocalePreference,
	type ListGroupMode,
	type LocalePreference,
} from "./i18n";

export type { ListGroupMode, LocalePreference };

export type CalendarDensity = "full" | "two" | "one";

export type SidebarTab = "myday" | "suggest" | "day" | "list" | "stats";

export const SIDEBAR_TABS: readonly SidebarTab[] = ["myday", "suggest", "day", "list", "stats"];

export function isSidebarTab(value: unknown): value is SidebarTab {
	return typeof value === "string" && (SIDEBAR_TABS as readonly string[]).includes(value);
}

export type TaskPriority = "highest" | "high" | "medium" | "low" | "lowest" | null;

export interface ParsedTask {
	/** Stable key within a vault snapshot: path + content fingerprint */
	id: string;
	path: string;
	line: number;
	/** Raw markdown line */
	raw: string;
	/** Checkbox status */
	completed: boolean;
	/** Visible title without emoji markers */
	title: string;
	due: string | null;
	scheduled: string | null;
	created: string | null;
	doneDate: string | null;
	priority: TaskPriority;
	recurring: boolean;
	hasDescription: boolean;
	tags: string[];
}

export interface TodoPluginSettings {
	/** `auto` follows Obsidian language; otherwise a fixed locale */
	locale: LocalePreference;
	groupByDocument: boolean;
	calendarDensity: CalendarDensity;
	/** Show the statistics sidebar tab in the toolbar */
	showStatsTab: boolean;
	/** Show the all-tasks list sidebar tab */
	showListTab: boolean;
	/** Grouping mode for the Tasks list tab */
	listGroupMode: ListGroupMode;
	/** Hide completed tasks in the Tasks list tab */
	listHideCompleted: boolean;
	/** Folder paths to exclude from scanning (vault-relative) */
	excludeFolders: string[];
}

export interface TodoPluginData {
	settings: TodoPluginSettings;
	/** Local calendar day (YYYY-MM-DD) this My Day list belongs to */
	myDayDate: string;
	/** Task ids currently in My Day */
	myDayIds: string[];
	lastTab: SidebarTab;
}

export const DEFAULT_SETTINGS: TodoPluginSettings = {
	locale: "auto",
	groupByDocument: true,
	calendarDensity: "full",
	showStatsTab: true,
	showListTab: true,
	listGroupMode: "document",
	listHideCompleted: true,
	excludeFolders: [],
};

export function createDefaultData(today: string): TodoPluginData {
	return {
		settings: { ...DEFAULT_SETTINGS },
		myDayDate: today,
		myDayIds: [],
		lastTab: "suggest",
	};
}

export function normalizeSettings(partial?: Partial<TodoPluginSettings>): TodoPluginSettings {
	const merged: TodoPluginSettings = {
		...DEFAULT_SETTINGS,
		...(partial ?? {}),
		locale: isLocalePreference(partial?.locale) ? partial.locale : DEFAULT_SETTINGS.locale,
		excludeFolders: Array.isArray(partial?.excludeFolders)
			? partial.excludeFolders.filter((f): f is string => typeof f === "string")
			: [],
		listGroupMode:
			partial?.listGroupMode === "flat" ||
			partial?.listGroupMode === "document" ||
			partial?.listGroupMode === "tag"
				? partial.listGroupMode
				: DEFAULT_SETTINGS.listGroupMode,
	};
	return merged;
}
