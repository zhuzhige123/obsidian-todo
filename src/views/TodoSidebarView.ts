import { ItemView, Menu, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type TodoPlugin from "../main";
import type { CalendarDensity, ParsedTask, SidebarTab } from "../types";
import type { MessageKey } from "../i18n";
import { formatDayHeading, parseLocalDateKey, toLocalDateKey } from "../utils/dates";
import {
	getMarkersForDay,
	getSuggestionBuckets,
	getTasksForCalendarDay,
	groupTasksByPath,
} from "../services/task-queries";
import { filterTasksBySearch } from "../services/task-search";
import { groupOverdueTasks } from "../services/overdue-buckets";
import { computeTaskStats } from "../services/task-stats";
import { openTaskAtLine } from "../navigation/open-task";
import {
	indentTask,
	insertRootTask,
	insertSiblingTask,
	insertSubtask,
	outdentTask,
	setTaskCompleted,
	setTaskDue,
} from "../services/task-actions";
import { renderCalendar } from "../ui/calendar";
import { createImageUrlResolver, renderTaskRow, type TaskRowLabels } from "../ui/task-row";
import { documentGroupTitle, renderTaskGroup } from "../ui/task-group";
import {
	beginChildDraft,
	beginRootDraft,
	beginSiblingDraft,
	openChildDraftInPlace,
	removeDraftRowsInPlace,
	renderTaskForest,
	type TaskForestDraftHandlers,
} from "../ui/task-forest";
import { renderStatsView } from "../ui/stats-view";
import { renderTaskListView } from "../ui/task-list-view";
import { renderMyDayEmpty } from "../ui/myday-empty";
import { bindTaskListKeys } from "../ui/task-list-keys";
import {
	findTaskRowById,
	patchCheckStatesForPath,
	playTaskCheckMotion,
	removeTaskRowLocally,
} from "../ui/task-check-motion";
import {
	clearTaskDraft,
	getSelectedTaskId,
	getTaskDraft,
	setSelectedTaskId,
	type TaskDraft,
} from "../ui/task-session";
import {
	closeActiveDateTimePanel,
	isDateTimePanelOpen,
	setDateTimePanelCloseListener,
} from "../ui/date-time-picker";
import { createTodoSearchPanel, type TodoSearchPanel } from "../ui/search-panel";
import { clearChildren, el } from "../ui/dom";

export const TODO_SIDEBAR_VIEW_TYPE = "todo-sidebar";

const OVERDUE_TITLE_KEYS: Record<string, MessageKey> = {
	"earlier-this-week": "overdueEarlierThisWeek",
	"last-week": "overdueLastWeek",
	"past-month": "overduePastMonth",
	earlier: "overdueEarlier",
	"older-than-year": "overdueOlderThanYear",
};

export class TodoSidebarView extends ItemView {
	plugin: TodoPlugin;
	private tab: SidebarTab = "suggest";
	private searchOpen = false;
	private searchQuery = "";
	private selectedDay = toLocalDateKey();
	private calendarMonth = parseLocalDateKey(toLocalDateKey());
	private unsubIndex: (() => void) | null = null;
	private rootEl: HTMLElement | null = null;
	private searchPanelEl: HTMLElement | null = null;
	private searchPanel: TodoSearchPanel | null = null;
	private searchBtnEl: HTMLButtonElement | null = null;
	private viewsHost: HTMLElement | null = null;
	private myDayHost: HTMLElement | null = null;
	private suggestHost: HTMLElement | null = null;
	private dayHost: HTMLElement | null = null;
	private listHost: HTMLElement | null = null;
	private statsHost: HTMLElement | null = null;
	private calendarHost: HTMLElement | null = null;
	private dayListHost: HTMLElement | null = null;
	private dayTitleEl: HTMLElement | null = null;
	private tabButtons = new Map<SidebarTab, HTMLButtonElement>();
	private unbindListKeys: (() => void) | null = null;
	/** Suppress index-driven refresh while a UI check-motion chain is running. */
	private motionLock = 0;
	/** Suppress vault→index→refresh after a local checkbox write (prevents scroll jump). */
	private quietWrites = 0;
	/** Date/time panel edited a row; refresh once the panel closes. */
	private duePanelDirty = false;

	constructor(leaf: WorkspaceLeaf, plugin: TodoPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.tab = this.sanitizeTab(plugin.data.lastTab);
	}

	getViewType(): string {
		return TODO_SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.plugin.t("pluginName");
	}

	getIcon(): string {
		return "check-square";
	}

	/** Rebuild chrome after locale / visibility settings change. */
	reloadFromSettings(): void {
		this.tab = this.sanitizeTab(this.tab);
		this.plugin.data.lastTab = this.tab;
		void this.plugin.savePluginData();
		const keepSearch = this.searchOpen;
		const keepQuery = this.searchQuery;
		this.renderShell();
		this.searchOpen = keepSearch;
		this.searchQuery = keepQuery;
		if (keepSearch) {
			this.searchBtnEl?.classList.add("is-active");
			this.searchPanelEl?.classList.add("is-open");
			this.searchPanel?.setOpen(true);
			if (keepQuery) this.searchPanel?.input && (this.searchPanel.input.value = keepQuery);
		}
		this.refresh();
	}

	async onOpen(): Promise<void> {
		this.unsubIndex?.();
		this.unsubIndex = this.plugin.taskIndex.onChange(() => this.refresh());
		setDateTimePanelCloseListener(() => {
			if (!this.duePanelDirty) return;
			this.duePanelDirty = false;
			/* Regroup overdue/today buckets without jumping the viewport. */
			this.refreshPreservingScroll();
		});
		this.renderShell();
		this.refresh();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf !== this.leaf) this.searchPanel?.dismissSuggest();
			}),
		);
	}

	async onClose(): Promise<void> {
		closeActiveDateTimePanel();
		setDateTimePanelCloseListener(null);
		this.duePanelDirty = false;
		this.unsubIndex?.();
		this.unsubIndex = null;
		this.unbindListKeys?.();
		this.unbindListKeys = null;
		this.searchPanel?.destroy();
		this.searchPanel = null;
	}

	private t(key: MessageKey, vars?: Record<string, string | number>): string {
		return this.plugin.t(key, vars);
	}

	private sanitizeTab(tab: SidebarTab): SidebarTab {
		if (tab === "stats" && !this.isStatsTabEnabled()) return "suggest";
		if (tab === "list" && !this.isListTabEnabled()) return "suggest";
		return tab;
	}

	private duePickerLabels() {
		return {
			setDue: this.t("draftSetDue"),
			clearDueAria: this.t("draftClearDueAria"),
			closePanel: this.t("draftClosePanel"),
			prevMonth: this.t("prevMonth"),
			nextMonth: this.t("nextMonth"),
		};
	}

	private rowLabels(): TaskRowLabels {
		return {
			complete: this.t("complete"),
			incomplete: this.t("incomplete"),
			openTask: (title) => this.t("openTask", { title }),
			addToMyDay: this.t("addToMyDay"),
			removeFromMyDay: this.t("removeFromMyDay"),
			addSubtask: this.t("addSubtask"),
			addSubtaskDisabledCollapsed: this.t("addSubtaskDisabledCollapsed"),
			addSubtaskMaxDepth: this.t("addSubtaskMaxDepth"),
			collapseChildren: this.t("collapseChildren"),
			expandChildren: this.t("expandChildren"),
			recurring: this.t("recurring"),
			createdToday: this.t("createdToday"),
			hasAttachment: this.t("hasAttachment"),
			bugIssue: this.t("bugIssue"),
			duePicker: this.duePickerLabels(),
		};
	}

	private draftRowLabels() {
		return {
			placeholder: this.t("addSubtaskPlaceholder"),
			confirmCreate: this.t("draftConfirmCreate"),
			...this.duePickerLabels(),
		};
	}

	private draftHandlers(): TaskForestDraftHandlers {
		return {
			labels: this.draftRowLabels(),
			onSubmit: (draft, title, due, dueTime) => {
				void this.commitDraft(draft, title, due, dueTime);
			},
			onCancel: () => {
				clearTaskDraft();
				if (this.rootEl) {
					removeDraftRowsInPlace(this.rootEl);
					return;
				}
				this.refreshPreservingScroll();
			},
		};
	}

	private async commitDraft(
		draft: TaskDraft,
		title: string,
		due: string | null,
		dueTime: string | null,
	): Promise<void> {
		const fileTasks = this.plugin.taskIndex.getByPath(draft.path);
		let created: { line: number; path: string } | null = null;

		if (draft.kind === "child") {
			const parent = this.plugin.taskIndex.getById(draft.parentId);
			if (!parent) return;
			created = await insertSubtask(
				this.app,
				parent,
				title,
				fileTasks,
				due,
				dueTime,
			);
		} else if (draft.kind === "sibling") {
			const anchor = this.plugin.taskIndex.getById(draft.afterId);
			if (!anchor) return;
			created = await insertSiblingTask(
				this.app,
				anchor,
				title,
				fileTasks,
				due,
				dueTime,
			);
		} else {
			created = await insertRootTask(
				this.app,
				draft.path,
				title,
				fileTasks,
				due,
				dueTime,
			);
		}

		/* Exit edit mode immediately — then sync disk → index → list. */
		clearTaskDraft();
		if (this.rootEl) removeDraftRowsInPlace(this.rootEl);

		if (!created) {
			this.refreshPreservingScroll();
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(created.path);
		if (file instanceof TFile) {
			await this.plugin.taskIndex.refreshFile(file, { emit: false });
		}
		this.refreshPreservingScroll();
		/* Suppress the late vault→index emit from the write above. */
		this.quietWrites += 1;
		window.setTimeout(() => {
			this.quietWrites = Math.max(0, this.quietWrites - 1);
		}, 160);
	}

	/** Open child draft without rebuilding the whole list. */
	private openChildDraft(task: ParsedTask): void {
		const host = this.rootEl;
		const showGuides = this.plugin.data.settings.showNestGuideLines !== false;
		if (host && openChildDraftInPlace(host, task, this.draftHandlers(), showGuides)) {
			return;
		}
		if (!beginChildDraft(task)) return;
		this.refreshPreservingScroll();
	}

	private bindKeysToHost(host: HTMLElement | null): void {
		this.unbindListKeys?.();
		this.unbindListKeys = null;
		if (!host) return;
		this.unbindListKeys = bindTaskListKeys(host, {
			getTaskById: (id) => this.plugin.taskIndex.getById(id),
			onIndent: (task) => {
				void (async () => {
					const ok = await indentTask(
						this.app,
						task,
						this.plugin.taskIndex.getByPath(task.path),
					);
					if (!ok) return;
					const file = this.app.vault.getAbstractFileByPath(task.path);
					if (file instanceof TFile) await this.plugin.taskIndex.refreshFile(file);
					this.refresh();
				})();
			},
			onOutdent: (task) => {
				void (async () => {
					const ok = await outdentTask(
						this.app,
						task,
						this.plugin.taskIndex.getByPath(task.path),
					);
					if (!ok) return;
					const file = this.app.vault.getAbstractFileByPath(task.path);
					if (file instanceof TFile) await this.plugin.taskIndex.refreshFile(file);
					this.refresh();
				})();
			},
			onAddSibling: (task) => {
				beginSiblingDraft(task);
				this.refreshPreservingScroll();
			},
			onAddChild: (task) => {
				this.openChildDraft(task);
			},
			onCancelDraft: () => {
				if (!getTaskDraft()) return;
				clearTaskDraft();
				if (this.rootEl) {
					removeDraftRowsInPlace(this.rootEl);
					return;
				}
				this.refreshPreservingScroll();
			},
			onToggleComplete: (task) => {
				const next = !task.completed;
				this.toggleTaskComplete(task, next);
			},
		});
	}

	private renderShell(): void {
		this.searchPanel?.destroy();
		this.searchPanel = null;

		const container = this.containerEl.children[1] as HTMLElement;
		clearChildren(container);
		container.classList.add("todo-sidebar-view");

		const root = el("div", { cls: "todo-sidebar", parent: container });
		this.rootEl = root;
		this.syncMotionAttr();

		const toolbar = el("div", {
			cls: ["todo-toolbar", "nav-header"],
			parent: root,
			attr: { role: "toolbar", "aria-label": this.t("toolbarLabel") },
		});
		const buttons = el("div", { cls: "nav-buttons-container", parent: toolbar });

		this.tabButtons.clear();
		this.tabButtons.set("myday", this.makeTabButton(buttons, "myday", "sun", this.t("tabMyDay")));
		this.tabButtons.set(
			"suggest",
			this.makeTabButton(buttons, "suggest", "lightbulb", this.t("tabSuggest")),
		);
		this.tabButtons.set("day", this.makeTabButton(buttons, "day", "calendar", this.t("tabDay")));
		this.tabButtons.set("list", this.makeTabButton(buttons, "list", "list", this.t("tabList")));
		this.tabButtons.set("stats", this.makeTabButton(buttons, "stats", "pie-chart", this.t("tabStats")));

		this.searchBtnEl = el("button", {
			cls: ["clickable-icon", "nav-action-button"],
			parent: buttons,
			attr: { type: "button", "aria-label": this.t("search"), title: this.t("search") },
		});
		setIcon(this.searchBtnEl, "search");
		this.searchBtnEl.addEventListener("click", () => {
			this.searchOpen = !this.searchOpen;
			this.searchBtnEl?.classList.toggle("is-active", this.searchOpen);
			this.searchPanelEl?.classList.toggle("is-open", this.searchOpen);
			this.searchPanel?.setOpen(this.searchOpen);
			if (this.searchOpen) this.searchPanel?.focus();
			else {
				this.searchQuery = "";
				this.searchPanel?.clear();
				this.refresh();
			}
		});

		const toolsBtn = el("button", {
			cls: ["clickable-icon", "nav-action-button"],
			parent: buttons,
			attr: { type: "button", "aria-label": this.t("more"), title: this.t("more") },
		});
		setIcon(toolsBtn, "settings");
		toolsBtn.addEventListener("click", (event) => this.showToolsMenu(event, toolsBtn));

		this.searchPanelEl = el("div", { cls: "todo-search-panel", parent: root });
		this.searchPanel = createTodoSearchPanel({
			app: this.app,
			placeholder: this.t("searchPlaceholder"),
			getTags: () => {
				const tags = new Set<string>();
				for (const task of this.plugin.taskIndex.getAll()) {
					for (const tag of task.tags) tags.add(tag);
				}
				return [...tags].sort((a, b) => a.localeCompare(b, "zh"));
			},
			onQueryChange: (query) => {
				this.searchQuery = query;
				this.refresh();
			},
		});
		this.searchPanelEl.appendChild(this.searchPanel.root);

		this.viewsHost = el("div", { cls: "todo-views", parent: root });
		this.myDayHost = el("div", {
			cls: "todo-view",
			parent: this.viewsHost,
			attr: { "data-name": "myday" },
		});
		this.suggestHost = el("div", {
			cls: "todo-view",
			parent: this.viewsHost,
			attr: { "data-name": "suggest" },
		});
		this.dayHost = el("div", {
			cls: "todo-view",
			parent: this.viewsHost,
			attr: { "data-name": "day" },
		});
		this.listHost = el("div", {
			cls: "todo-view",
			parent: this.viewsHost,
			attr: { "data-name": "list" },
		});
		this.statsHost = el("div", {
			cls: "todo-view",
			parent: this.viewsHost,
			attr: { "data-name": "stats" },
		});

		this.buildDayWorkspaceShell();
		this.syncTabButtons();
	}

	private makeTabButton(
		parent: HTMLElement,
		tab: SidebarTab,
		icon: string,
		label: string,
	): HTMLButtonElement {
		const btn = el("button", {
			cls: ["clickable-icon", "nav-action-button"],
			parent,
			attr: {
				type: "button",
				title: label,
				"aria-label": label,
				"aria-pressed": "false",
				"data-tab": tab,
			},
		});
		try {
			setIcon(btn, icon);
		} catch {
			btn.textContent = label.slice(0, 1);
		}
		btn.addEventListener("click", () => this.setTab(tab));
		return btn;
	}

	private buildDayWorkspaceShell(): void {
		if (!this.dayHost) return;
		clearChildren(this.dayHost);

		const calToolbar = el("div", { cls: "todo-cal-toolbar", parent: this.dayHost });
		const monthLabel = el("div", { cls: "todo-cal-month", parent: calToolbar });
		el("span", {
			cls: "todo-cal-month__m",
			text: `${this.calendarMonth.getMonth() + 1}`,
			parent: monthLabel,
			attr: { "data-role": "month" },
		});
		el("span", {
			cls: "todo-cal-month__y",
			text: String(this.calendarMonth.getFullYear()),
			parent: monthLabel,
			attr: { "data-role": "year" },
		});

		const actions = el("div", { cls: "todo-cal-actions", parent: calToolbar });
		const prev = el("button", {
			cls: ["todo-cal-nav", "clickable-icon"],
			parent: actions,
			attr: { type: "button", "aria-label": this.t("prevMonth"), title: this.t("prevMonth") },
		});
		setIcon(prev, "chevron-left");
		prev.addEventListener("click", () => {
			this.calendarMonth = new Date(
				this.calendarMonth.getFullYear(),
				this.calendarMonth.getMonth() - 1,
				1,
			);
			this.refreshDayView();
		});

		const todayBtn = el("button", {
			cls: ["todo-today-btn", "clickable-icon"],
			parent: actions,
			attr: { type: "button", title: this.t("today"), "aria-label": this.t("today") },
			text: this.t("today"),
		});
		todayBtn.addEventListener("click", () => {
			const today = toLocalDateKey();
			this.selectedDay = today;
			this.calendarMonth = parseLocalDateKey(today);
			this.refreshDayView();
		});

		const next = el("button", {
			cls: ["todo-cal-nav", "clickable-icon"],
			parent: actions,
			attr: { type: "button", "aria-label": this.t("nextMonth"), title: this.t("nextMonth") },
		});
		setIcon(next, "chevron-right");
		next.addEventListener("click", () => {
			this.calendarMonth = new Date(
				this.calendarMonth.getFullYear(),
				this.calendarMonth.getMonth() + 1,
				1,
			);
			this.refreshDayView();
		});

		this.calendarHost = el("div", { cls: "todo-cal", parent: this.dayHost });
		this.dayTitleEl = el("div", { cls: "todo-day-label", parent: this.dayHost });
		this.dayListHost = el("div", { cls: "todo-scroll", parent: this.dayHost });
	}

	private setTab(tab: SidebarTab): void {
		const next = this.sanitizeTab(tab);
		this.tab = next;
		this.plugin.data.lastTab = next;
		void this.plugin.savePluginData();
		this.searchPanel?.dismissSuggest();
		this.syncTabButtons();
		this.refresh();
	}

	private isStatsTabEnabled(): boolean {
		return this.plugin.data.settings.showStatsTab !== false;
	}

	private isListTabEnabled(): boolean {
		return this.plugin.data.settings.showListTab !== false;
	}

	private syncOptionalTab(tab: "stats" | "list", visible: boolean): void {
		const btn = this.tabButtons.get(tab);
		if (!btn) return;
		btn.hidden = !visible;
		btn.classList.toggle("is-tab-hidden", !visible);
		btn.toggleAttribute("aria-hidden", !visible);
		if (visible) btn.removeAttribute("tabindex");
		else btn.tabIndex = -1;
		if (!visible) {
			btn.classList.remove("is-active");
			btn.setAttribute("aria-pressed", "false");
		}
	}

	private syncTabButtons(): void {
		const statsVisible = this.isStatsTabEnabled();
		const listVisible = this.isListTabEnabled();
		this.syncOptionalTab("stats", statsVisible);
		this.syncOptionalTab("list", listVisible);

		for (const [tab, btn] of this.tabButtons) {
			if (tab === "stats" && !statsVisible) continue;
			if (tab === "list" && !listVisible) continue;
			const on = tab === this.tab;
			btn.classList.toggle("is-active", on);
			btn.setAttribute("aria-pressed", String(on));
		}
		this.myDayHost?.classList.toggle("is-active", this.tab === "myday");
		this.suggestHost?.classList.toggle("is-active", this.tab === "suggest");
		this.dayHost?.classList.toggle("is-active", this.tab === "day");
		this.listHost?.classList.toggle("is-active", this.tab === "list" && listVisible);
		this.statsHost?.classList.toggle("is-active", this.tab === "stats" && statsVisible);
	}

	private showToolsMenu(event: MouseEvent, anchor: HTMLElement): void {
		const menu = new Menu();
		const density = this.plugin.data.settings.calendarDensity;
		const densites: Array<{ id: CalendarDensity; titleKey: MessageKey }> = [
			{ id: "full", titleKey: "calendarFull" },
			{ id: "two", titleKey: "calendarTwo" },
			{ id: "one", titleKey: "calendarOne" },
		];
		for (const item of densites) {
			menu.addItem((menuItem) => {
				menuItem
					.setTitle(this.t(item.titleKey))
					.setChecked(density === item.id)
					.onClick(() => {
						this.plugin.data.settings.calendarDensity = item.id;
						void this.plugin.savePluginData();
						this.refreshDayView();
					});
			});
		}
		menu.addSeparator();
		menu.addItem((menuItem) => {
			menuItem
				.setTitle(this.t("groupByDocument"))
				.setChecked(this.plugin.data.settings.groupByDocument)
				.onClick(() => {
					this.plugin.data.settings.groupByDocument = !this.plugin.data.settings.groupByDocument;
					void this.plugin.savePluginData();
					this.refresh();
				});
		});

		const listGroup = this.plugin.data.settings.listGroupMode;
		const listGroupItems: Array<{ id: typeof listGroup; titleKey: MessageKey }> = [
			{ id: "flat", titleKey: "settingsListGroupFlat" },
			{ id: "document", titleKey: "settingsListGroupDocument" },
			{ id: "tag", titleKey: "settingsListGroupTag" },
		];
		for (const item of listGroupItems) {
			menu.addItem((menuItem) => {
				menuItem
					.setTitle(this.t(item.titleKey))
					.setChecked(listGroup === item.id)
					.onClick(() => {
						this.plugin.data.settings.listGroupMode = item.id;
						void this.plugin.savePluginData();
						this.refresh();
					});
			});
		}
		menu.addItem((menuItem) => {
			menuItem
				.setTitle(this.t("settingsHideCompleted"))
				.setChecked(this.plugin.data.settings.listHideCompleted)
				.onClick(() => {
					this.plugin.data.settings.listHideCompleted =
						!this.plugin.data.settings.listHideCompleted;
					void this.plugin.savePluginData();
					this.refresh();
				});
		});

		menu.addSeparator();
		menu.addItem((menuItem) => {
			menuItem
				.setTitle(this.t("showListTab"))
				.setChecked(this.isListTabEnabled())
				.onClick(() => {
					const next = !this.isListTabEnabled();
					this.plugin.data.settings.showListTab = next;
					void this.plugin.savePluginData();
					if (!next && this.tab === "list") this.setTab("suggest");
					else {
						this.syncTabButtons();
						this.refresh();
					}
				});
		});
		menu.addItem((menuItem) => {
			menuItem
				.setTitle(this.t("showStatsTab"))
				.setChecked(this.isStatsTabEnabled())
				.onClick(() => {
					const next = !this.isStatsTabEnabled();
					this.plugin.data.settings.showStatsTab = next;
					void this.plugin.savePluginData();
					if (!next && this.tab === "stats") this.setTab("suggest");
					else {
						this.syncTabButtons();
						this.refresh();
					}
				});
		});
		menu.showAtMouseEvent(event);
		anchor.classList.add("is-active");
		window.setTimeout(() => anchor.classList.remove("is-active"), 200);
	}

	refresh(): void {
		if (this.motionLock > 0 || this.quietWrites > 0) return;
		this.plugin.myDay.ensureToday();
		this.plugin.myDay.pruneMissing(new Set(this.plugin.taskIndex.getAll().map((t) => t.id)));
		const safe = this.sanitizeTab(this.tab);
		if (safe !== this.tab) {
			this.setTab(safe);
			return;
		}
		this.syncTabButtons();
		this.syncMotionAttr();
		if (this.tab === "myday") this.refreshMyDay();
		else if (this.tab === "suggest") this.refreshSuggest();
		else if (this.tab === "list") this.refreshList();
		else if (this.tab === "stats") this.refreshStats();
		else this.refreshDayView();
	}

	/** Full rebuild that restores the scrollable pane position (due edits, etc.). */
	private refreshPreservingScroll(): void {
		const scroller = this.getScrollHost();
		const top = scroller?.scrollTop ?? 0;
		this.refresh();
		if (!scroller) return;
		requestAnimationFrame(() => {
			scroller.scrollTop = top;
			requestAnimationFrame(() => {
				scroller.scrollTop = top;
			});
		});
	}

	private getScrollHost(): HTMLElement | null {
		const content = this.containerEl.children[1];
		if (content instanceof HTMLElement) return content;
		return this.rootEl;
	}

	private syncMotionAttr(): void {
		const on = this.plugin.data.settings.enableTaskMotion !== false;
		this.rootEl?.setAttribute("data-motion", on ? "on" : "off");
	}

	/**
	 * UI / keyboard toggle — motion + vault write + local DOM patch only.
	 * Never full-refreshes the list (that resets scroll to top).
	 */
	private toggleTaskComplete(task: ParsedTask, completed: boolean): void {
		if (this.motionLock > 0) return;
		void (async () => {
			const settings = this.plugin.data.settings;
			const host = this.rootEl;
			const row = host ? findTaskRowById(host, task.id) : null;
			this.motionLock += 1;
			this.quietWrites += 1;
			try {
				if (row) {
					await playTaskCheckMotion(row, task.id, completed, {
						enabled: settings.enableTaskMotion !== false,
						autoCollapseOnComplete: settings.autoCollapseOnParentComplete === true,
					});
				}
				const ok = await setTaskCompleted(this.app, task, completed, {
					linkParentChild: settings.parentChildCheckLink,
					fileTasks: this.plugin.taskIndex.getByPath(task.path),
				});
				if (!ok) return;
				if (completed) this.plugin.myDay.remove(task.id);
				await this.plugin.savePluginData();

				const file = this.app.vault.getAbstractFileByPath(task.path);
				if (file instanceof TFile) {
					await this.plugin.taskIndex.refreshFile(file, { emit: false });
				}

				if (host) {
					const byId = this.plugin.taskIndex.getByIdMap();
					patchCheckStatesForPath(
						host,
						task.path,
						byId,
						settings.parentChildCheckLink,
					);
					const shouldHideCompleted =
						completed &&
						(this.tab === "myday" ||
							this.tab === "suggest" ||
							(this.tab === "list" && settings.listHideCompleted));
					if (shouldHideCompleted) {
						const toRemove: HTMLElement[] = [];
						host.querySelectorAll(".todo-task[data-id]").forEach((el) => {
							if (!(el instanceof HTMLElement)) return;
							const id = el.getAttribute("data-id");
							const t = id ? byId.get(id) : undefined;
							if (t && t.path === task.path && t.completed) toRemove.push(el);
						});
						for (const el of toRemove) removeTaskRowLocally(el);
					}
				}
			} finally {
				this.motionLock = Math.max(0, this.motionLock - 1);
				/* Cover vault modify → index emit that arrives after our silent sync. */
				window.setTimeout(() => {
					this.quietWrites = Math.max(0, this.quietWrites - 1);
				}, 160);
			}
		})();
	}

	private rowHandlers() {
		return {
			onOpen: (task: ParsedTask) => {
				void openTaskAtLine(this.app, task);
			},
			onToggleComplete: (task: ParsedTask, completed: boolean) => {
				this.toggleTaskComplete(task, completed);
			},
			onAddToMyDay: (task: ParsedTask) => {
				if (this.plugin.myDay.add(task.id)) {
					void this.plugin.savePluginData();
				}
				window.setTimeout(() => this.refresh(), 220);
			},
			onRemoveFromMyDay: (task: ParsedTask) => {
				this.plugin.myDay.remove(task.id);
				void this.plugin.savePluginData();
				this.refresh();
			},
			onAddSubtask: (task: ParsedTask) => {
				this.openChildDraft(task);
			},
			onSetDue: (task: ParsedTask, due: string | null, dueTime: string | null) => {
				void (async () => {
					this.quietWrites += 1;
					try {
						const ok = await setTaskDue(this.app, task, due, dueTime);
						if (!ok) return;
						const file = this.app.vault.getAbstractFileByPath(task.path);
						if (file instanceof TFile) {
							/* Same pattern as check: silent index sync, no list rebuild. */
							await this.plugin.taskIndex.refreshFile(file, { emit: false });
						}
						/* Due changes rewrite task id fingerprint — keep the row keyed. */
						const host = this.rootEl;
						const updated = this.plugin.taskIndex
							.getByPath(task.path)
							.find((t) => t.line === task.line);
						if (host && updated) {
							const row = findTaskRowById(host, task.id);
							row?.setAttribute("data-id", updated.id);
							if (getSelectedTaskId() === task.id) {
								setSelectedTaskId(updated.id);
							}
						}
					} finally {
						window.setTimeout(() => {
							this.quietWrites = Math.max(0, this.quietWrites - 1);
						}, 160);
					}
					if (isDateTimePanelOpen()) {
						this.duePanelDirty = true;
						return;
					}
					this.refreshPreservingScroll();
				})();
			},
			onSelect: (task: ParsedTask) => {
				setSelectedTaskId(task.id);
				const host = this.listHost ?? this.dayListHost ?? this.rootEl;
				if (!host) return;
				host.querySelectorAll(".todo-task[data-id]").forEach((row) => {
					row.classList.toggle(
						"is-selected",
						row.getAttribute("data-id") === task.id,
					);
				});
			},
			onNestCollapse: () => {
				/* Used by draft/group entry points to re-render; twist collapse is local. */
				this.refresh();
			},
			resolveImageUrl: createImageUrlResolver(this.app),
		};
	}

	private updateSearchMatch(matched: number, total: number): void {
		this.searchPanel?.setMatchCount(matched, total, this.searchQuery);
	}

	private refreshMyDay(): void {
		if (!this.myDayHost) return;
		const ids = this.plugin.myDay.getIds();
		const base = ids
			.map((id) => this.plugin.taskIndex.getById(id))
			.filter((t): t is ParsedTask => !!t && !t.completed);
		const tasks = filterTasksBySearch(base, this.searchQuery);
		this.updateSearchMatch(tasks.length, base.length);

		if (!ids.length) {
			this.myDayHost.classList.add("is-empty");
			renderMyDayEmpty(
				this.myDayHost,
				formatDayHeading(this.plugin.myDay.getDate()),
				{
					headTitle: this.t("tabMyDay"),
					title: this.t("myDayEmptyTitle"),
					desc: this.t("myDayEmptyDesc"),
					action: this.t("myDayEmptyAction"),
				},
				{ onAddTasks: () => this.setTab("suggest") },
			);
			return;
		}

		this.myDayHost.classList.remove("is-empty");
		clearChildren(this.myDayHost);
		const head = el("div", { cls: "todo-myday-head", parent: this.myDayHost });
		el("div", { cls: "todo-myday-head__title", text: this.t("tabMyDay"), parent: head });
		el("div", {
			cls: "todo-myday-head__sub",
			text: formatDayHeading(this.plugin.myDay.getDate()),
			parent: head,
		});

		const scroll = el("div", { cls: "todo-scroll", parent: this.myDayHost });
		if (!tasks.length) {
			el("div", { cls: "todo-empty", text: this.t("noMatch"), parent: scroll });
			return;
		}

		const handlers = this.rowHandlers();
		const labels = this.rowLabels();
		for (const task of tasks) renderTaskRow(scroll, task, "myday", handlers, labels);
	}

	private refreshSuggest(): void {
		if (!this.suggestHost) return;
		clearChildren(this.suggestHost);
		const scroll = el("div", { cls: "todo-scroll", parent: this.suggestHost });
		const today = toLocalDateKey();
		const exclude = new Set(this.plugin.myDay.getIds());
		const buckets = getSuggestionBuckets(this.plugin.taskIndex.getAll(), today, exclude);
		const pool = [...buckets.overdue, ...buckets.dueToday, ...buckets.soon];
		const overdue = filterTasksBySearch(buckets.overdue, this.searchQuery);
		const dueToday = filterTasksBySearch(buckets.dueToday, this.searchQuery);
		const soon = filterTasksBySearch(buckets.soon, this.searchQuery);
		this.updateSearchMatch(overdue.length + dueToday.length + soon.length, pool.length);
		const handlers = this.rowHandlers();
		const labels = this.rowLabels();

		const renderSection = (title: string, list: ParsedTask[]) => {
			if (!list.length) return;
			const section = el("section", { cls: "todo-section", parent: scroll });
			const head = el("div", { cls: "todo-section__head", parent: section });
			el("div", { cls: "todo-section__title", text: title, parent: head });
			for (const task of list) renderTaskRow(section, task, "suggest", handlers, labels);
		};

		for (const overdueSection of groupOverdueTasks(overdue, today)) {
			const key = OVERDUE_TITLE_KEYS[overdueSection.id];
			renderSection(key ? this.t(key) : overdueSection.title, overdueSection.tasks);
		}
		renderSection(this.t("dueToday"), dueToday);
		renderSection(this.t("dueSoon"), soon);

		if (!overdue.length && !dueToday.length && !soon.length) {
			el("div", {
				cls: "todo-empty",
				text: this.searchQuery.trim() ? this.t("noMatch") : this.t("suggestEmpty"),
				parent: scroll,
			});
		}
	}

	private refreshList(): void {
		if (!this.listHost) return;
		const all = this.plugin.taskIndex.getAll();
		const tasks = filterTasksBySearch(all, this.searchQuery);
		this.updateSearchMatch(tasks.length, all.length);
		const settings = this.plugin.data.settings;
		renderTaskListView(this.listHost, {
			tasks,
			groupMode: settings.listGroupMode,
			hideCompleted: settings.listHideCompleted,
			handlers: this.rowHandlers(),
			indexById: this.plugin.taskIndex.getByIdMap(),
			linkParentChild: settings.parentChildCheckLink,
			showNestGuideLines: settings.showNestGuideLines,
			draftHandlers: this.draftHandlers(),
			labels: {
				title: this.t("listTitle"),
				empty: this.searchQuery.trim() ? this.t("noMatch") : this.t("listEmpty"),
				untagged: this.t("listUntagged"),
				count: (n) => this.t("listCount", { count: n }),
				addRootTask: this.t("addRootTask"),
				row: this.rowLabels(),
			},
		});
		this.bindKeysToHost(this.listHost.querySelector(".todo-scroll"));
	}

	private refreshStats(): void {
		if (!this.statsHost) return;
		const all = this.plugin.taskIndex.getAll();
		const tasks = filterTasksBySearch(all, this.searchQuery);
		this.updateSearchMatch(tasks.length, all.length);
		const stats = computeTaskStats(tasks);
		for (const item of stats.status) {
			if (item.id === "completed") item.label = this.t("statsCompleted");
			else if (item.id === "inProgress") item.label = this.t("statsInProgress");
			else item.label = this.t("statsOverdue");
		}
		renderStatsView(
			this.statsHost,
			stats,
			{
				onOpen: (task) => {
					void openTaskAtLine(this.app, task);
				},
			},
			{
				empty: this.t("statsEmpty"),
				status: this.t("statsStatus"),
				tags: this.t("statsTags"),
				attention: this.t("statsAttention"),
				noTags: this.t("statsNoTags"),
				noOverdue: this.t("statsNoOverdue"),
				overdueDays: (days) => this.t("statsOverdueDays", { days }),
				openTask: (title) => this.t("openTask", { title }),
			},
		);
	}

	private refreshDayView(): void {
		if (!this.dayHost || !this.calendarHost || !this.dayListHost || !this.dayTitleEl) {
			this.buildDayWorkspaceShell();
		}
		if (!this.calendarHost || !this.dayListHost || !this.dayTitleEl || !this.dayHost) return;

		const monthLabel = this.dayHost.querySelector('[data-role="month"]');
		const yearLabel = this.dayHost.querySelector('[data-role="year"]');
		if (monthLabel) monthLabel.textContent = `${this.calendarMonth.getMonth() + 1}`;
		if (yearLabel) yearLabel.textContent = String(this.calendarMonth.getFullYear());

		const today = toLocalDateKey();
		const all = this.plugin.taskIndex.getAll();
		renderCalendar(this.calendarHost, {
			month: this.calendarMonth,
			selected: this.selectedDay,
			today,
			density: this.plugin.data.settings.calendarDensity,
			getMarkers: (day) => getMarkersForDay(all, day, today),
			onSelect: (day) => {
				this.selectedDay = day;
				this.refreshDayView();
			},
		});

		const searching = this.searchQuery.trim().length > 0;
		const openTasks = all.filter((t) => !t.completed);
		const dayTasks = getTasksForCalendarDay(all, this.selectedDay);
		const base = searching ? openTasks : dayTasks;
		const tasks = filterTasksBySearch(base, this.searchQuery);
		this.updateSearchMatch(tasks.length, base.length);

		this.dayTitleEl.textContent = searching
			? this.t("searchResults")
			: formatDayHeading(this.selectedDay);
		clearChildren(this.dayListHost);
		const handlers = this.rowHandlers();
		const labels = this.rowLabels();

		if (!tasks.length) {
			el("div", {
				cls: "todo-empty",
				text: searching ? this.t("noMatch") : this.t("dayEmpty"),
				parent: this.dayListHost,
			});
			return;
		}

		const settings = this.plugin.data.settings;
		const draftHandlers = this.draftHandlers();
		const nestOpts = {
			indexById: this.plugin.taskIndex.getByIdMap(),
			linkParentChild: settings.parentChildCheckLink,
			showNestGuideLines: settings.showNestGuideLines,
			draftHandlers,
		};

		if (!settings.groupByDocument) {
			renderTaskForest({
				parent: this.dayListHost,
				tasks,
				mode: "day",
				handlers,
				labels,
				...nestOpts,
			});
			this.bindKeysToHost(this.dayListHost);
			return;
		}

		for (const [path, list] of groupTasksByPath(tasks)) {
			renderTaskGroup(this.dayListHost, {
				variant: "document",
				title: documentGroupTitle(path),
				tooltip: path,
				collapseKey: `day:${path}`,
				countLabel: this.t("listCount", { count: list.length }),
				tasks: list,
				handlers,
				rowLabels: labels,
				rowMode: "day",
				rootTaskPath: path,
				addRootLabel: this.t("addRootTask"),
				onRequestRootDraft: (rootPath, groupKey) => {
					beginRootDraft(rootPath, groupKey);
					this.refresh();
				},
				...nestOpts,
			});
		}
		this.bindKeysToHost(this.dayListHost);
	}
}
