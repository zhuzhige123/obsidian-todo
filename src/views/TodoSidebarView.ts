import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
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
import { setTaskCompleted } from "../services/task-actions";
import { renderCalendar } from "../ui/calendar";
import { renderTaskRow, type TaskRowLabels } from "../ui/task-row";
import { renderStatsView } from "../ui/stats-view";
import { renderTaskListView } from "../ui/task-list-view";
import { renderMyDayEmpty } from "../ui/myday-empty";
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
		this.renderShell();
		this.refresh();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf !== this.leaf) this.searchPanel?.dismissSuggest();
			}),
		);
	}

	async onClose(): Promise<void> {
		this.unsubIndex?.();
		this.unsubIndex = null;
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

	private rowLabels(): TaskRowLabels {
		return {
			complete: this.t("complete"),
			incomplete: this.t("incomplete"),
			openTask: (title) => this.t("openTask", { title }),
			addToMyDay: this.t("addToMyDay"),
			removeFromMyDay: this.t("removeFromMyDay"),
			recurring: this.t("recurring"),
			createdToday: this.t("createdToday"),
		};
	}

	private renderShell(): void {
		this.searchPanel?.destroy();
		this.searchPanel = null;

		const container = this.containerEl.children[1] as HTMLElement;
		clearChildren(container);
		container.classList.add("todo-sidebar-view");

		const root = el("div", { cls: "todo-sidebar", parent: container });
		this.rootEl = root;

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
					else this.refresh();
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
					else this.refresh();
				});
		});
		menu.showAtMouseEvent(event);
		anchor.classList.add("is-active");
		window.setTimeout(() => anchor.classList.remove("is-active"), 200);
	}

	refresh(): void {
		this.plugin.myDay.ensureToday();
		this.plugin.myDay.pruneMissing(new Set(this.plugin.taskIndex.getAll().map((t) => t.id)));
		const safe = this.sanitizeTab(this.tab);
		if (safe !== this.tab) {
			this.setTab(safe);
			return;
		}
		this.syncTabButtons();
		if (this.tab === "myday") this.refreshMyDay();
		else if (this.tab === "suggest") this.refreshSuggest();
		else if (this.tab === "list") this.refreshList();
		else if (this.tab === "stats") this.refreshStats();
		else this.refreshDayView();
	}

	private rowHandlers() {
		return {
			onOpen: (task: ParsedTask) => {
				void openTaskAtLine(this.app, task);
			},
			onToggleComplete: (task: ParsedTask, completed: boolean) => {
				void (async () => {
					const ok = await setTaskCompleted(this.app, task, completed);
					if (ok && completed) this.plugin.myDay.remove(task.id);
					await this.plugin.savePluginData();
					window.setTimeout(() => this.refresh(), 220);
				})();
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
		renderTaskListView(this.listHost, {
			tasks,
			groupMode: this.plugin.data.settings.listGroupMode,
			hideCompleted: this.plugin.data.settings.listHideCompleted,
			handlers: this.rowHandlers(),
			labels: {
				title: this.t("listTitle"),
				empty: this.searchQuery.trim() ? this.t("noMatch") : this.t("listEmpty"),
				untagged: this.t("listUntagged"),
				count: (n) => this.t("listCount", { count: n }),
				row: this.rowLabels(),
			},
		});
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

		if (!this.plugin.data.settings.groupByDocument) {
			for (const task of tasks) renderTaskRow(this.dayListHost, task, "day", handlers, labels);
			return;
		}

		for (const [path, list] of groupTasksByPath(tasks)) {
			const group = el("div", { cls: "todo-group", parent: this.dayListHost });
			const head = el("div", { cls: "todo-group__head", parent: group });
			const ico = el("span", { parent: head });
			setIcon(ico, "file");
			el("span", { cls: "todo-group__path", text: path, parent: head });
			for (const task of list) renderTaskRow(group, task, "day", handlers, labels);
		}
	}
}
