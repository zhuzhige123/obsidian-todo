import { Menu, setIcon, TFolder, type App } from "obsidian";
import { SEARCH_FIELD_OPTIONS } from "../services/task-search";
import { el, clearChildren } from "./dom";

export interface TodoSearchPanelHosts {
	app: App;
	getTags: () => string[];
	onQueryChange: (query: string) => void;
	placeholder?: string;
}

export interface TodoSearchPanel {
	root: HTMLElement;
	input: HTMLInputElement;
	setMatchCount: (matched: number, total: number, query: string) => void;
	setOpen: (open: boolean) => void;
	dismissSuggest: () => void;
	focus: () => void;
	clear: () => void;
	destroy: () => void;
}

/**
 * Port of Weave Review CardSearchInput close contract:
 * - Options panel (FloatingMenu) closes when a prefix is chosen
 * - due / scheduled / priority use Obsidian Menu (closes on select)
 * - folder / tag use a secondary FloatingMenu panel
 * - Suggestions only open for bare prefixes (`due:`), never for `due:today`
 */
type SuggestPanel = "folder" | "tags" | null;

const PORTAL_OPTIONS = "todo-search-floating-menu todo-search-floating-menu--options";
const PORTAL_SUGGEST = "todo-search-floating-menu todo-search-floating-menu--suggest";

const DATE_PRESETS = [
	{ label: "today", value: "today" },
	{ label: "tomorrow", value: "tomorrow" },
	{ label: "thisweek", value: "thisweek" },
	{ label: "overdue", value: "overdue" },
];

const PRIORITY_PRESETS = [
	{ label: "highest", value: "highest" },
	{ label: "high", value: "high" },
	{ label: "medium", value: "medium" },
	{ label: "low", value: "low" },
	{ label: "lowest", value: "lowest" },
];

function purgePortals(): void {
	document.querySelectorAll(".todo-search-floating-menu").forEach((node) => node.remove());
}

function collectFolders(app: App): string[] {
	const folders = new Set<string>(["/"]);
	const walk = (folder: TFolder) => {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				folders.add(child.path);
				walk(child);
			}
		}
	};
	walk(app.vault.getRoot());
	return [...folders].sort((a, b) => a.localeCompare(b, "zh"));
}

function collectVaultTags(app: App, fromTasks: string[]): string[] {
	const tags = new Set<string>();
	for (const tag of fromTasks) tags.add(tag.startsWith("#") ? tag : `#${tag}`);
	const getTagsFn = (
		app.metadataCache as { getTags?: () => Record<string, number> }
	).getTags;
	const cached = typeof getTagsFn === "function" ? getTagsFn.call(app.metadataCache) : null;
	if (cached) {
		for (const key of Object.keys(cached)) {
			tags.add(key.startsWith("#") ? key : `#${key}`);
		}
	}
	return [...tags].sort((a, b) => a.localeCompare(b, "zh"));
}

export function createTodoSearchPanel(hosts: TodoSearchPanelHosts): TodoSearchPanel {
	purgePortals();

	const root = el("div", { cls: "todo-card-search-container" });
	const wrapper = el("div", { cls: "todo-search-input-wrapper", parent: root });

	const icon = el("div", { cls: "todo-search-icon", parent: wrapper });
	setIcon(icon, "search");

	const input = el("input", {
		cls: "todo-search-input",
		parent: wrapper,
		attr: {
			type: "text",
			placeholder: hosts.placeholder ?? "输入并开始搜索...",
			autocomplete: "off",
			spellcheck: "false",
		},
	});

	const matchCount = el("span", { cls: "todo-match-count", parent: wrapper });
	matchCount.hidden = true;

	const clearBtn = el("button", {
		cls: "todo-search-clear",
		parent: wrapper,
		attr: { type: "button", "aria-label": "清除搜索", title: "清除" },
	});
	setIcon(clearBtn, "x");
	clearBtn.hidden = true;

	const optionsMenu = el("div", { cls: PORTAL_OPTIONS });
	optionsMenu.hidden = true;
	document.body.appendChild(optionsMenu);

	const suggestMenu = el("div", { cls: PORTAL_SUGGEST });
	suggestMenu.hidden = true;
	document.body.appendChild(suggestMenu);

	let chromeOpen = false;
	let suggestPanel: SuggestPanel = null;
	let suggestQuery = "";
	let activeMenu: Menu | null = null;
	let destroyed = false;

	const syncChrome = () => {
		clearBtn.hidden = input.value.length === 0;
	};

	const emit = () => {
		syncChrome();
		hosts.onQueryChange(input.value);
	};

	const positionPortal = (portal: HTMLElement) => {
		const rect = wrapper.getBoundingClientRect();
		if (rect.width < 8 || rect.height < 8) {
			portal.hidden = true;
			return;
		}
		const width = Math.max(220, Math.round(rect.width));
		// Static chrome (position/max-width/z-index) lives in CSS; only place dynamically.
		portal.style.left = `${Math.round(rect.left)}px`;
		portal.style.top = `${Math.round(rect.bottom + 4)}px`;
		portal.style.width = `${width}px`;
	};

	const closeActiveMenu = () => {
		if (!activeMenu) return;
		const menu = activeMenu;
		activeMenu = null;
		menu.hide();
	};

	const hideOptions = () => {
		optionsMenu.hidden = true;
		clearChildren(optionsMenu);
	};

	const hideSuggestPanel = () => {
		suggestPanel = null;
		suggestQuery = "";
		suggestMenu.hidden = true;
		clearChildren(suggestMenu);
	};

	const dismissSuggest = () => {
		hideOptions();
		hideSuggestPanel();
		closeActiveMenu();
	};

	const getCurrentToken = (): string => {
		const cursor = input.selectionStart ?? input.value.length;
		const before = input.value.slice(0, cursor);
		const words = before.split(/\s+/);
		return words[words.length - 1] ?? "";
	};

	const replaceLastWord = (replacement: string) => {
		const cursor = input.selectionStart ?? input.value.length;
		const before = input.value.slice(0, cursor);
		const after = input.value.slice(cursor);
		const words = before.split(/\s+/);
		const last = words[words.length - 1] ?? "";
		words[words.length - 1] = last.replace(/[^:]*$/, replacement);
		const joined = `${words.join(" ")} `;
		input.value = joined + after.trimStart();
		emit();
		window.setTimeout(() => {
			input.focus();
			const pos = joined.length;
			input.setSelectionRange(pos, pos);
		}, 0);
	};

	const insertPrefix = (prefix: string) => {
		if (!input.value || input.value.endsWith(" ")) {
			input.value = `${input.value}${prefix}`;
		} else {
			input.value = `${input.value} ${prefix}`;
		}
		emit();
		window.setTimeout(() => {
			input.focus();
			input.setSelectionRange(input.value.length, input.value.length);
		}, 0);
	};

	const renderOptions = () => {
		clearChildren(optionsMenu);
		const panel = el("div", { cls: "todo-search-dropdown-panel", parent: optionsMenu });
		const section = el("div", { cls: "todo-search-dropdown__section", parent: panel });
		el("div", { cls: "todo-search-dropdown__header", text: "搜索选项", parent: section });

		for (const opt of SEARCH_FIELD_OPTIONS) {
			const item = el("button", {
				cls: "todo-search-dropdown__item",
				parent: section,
				attr: { type: "button" },
			});
			el("span", { cls: "todo-search-dropdown__label", text: opt.label, parent: item });
			item.addEventListener("mousedown", (event) => {
				event.preventDefault();
				insertPrefix(opt.prefix);
				// Weave: close options first, then open the field-specific suggester.
				hideOptions();
				window.setTimeout(() => runAfterInsert(opt.prefix), 100);
			});
		}
	};

	const showOptions = () => {
		if (destroyed || !chromeOpen) return;
		closeActiveMenu();
		hideSuggestPanel();
		renderOptions();
		positionPortal(optionsMenu);
		optionsMenu.hidden = false;
	};

	const showMenuSafe = (menu: Menu) => {
		if (destroyed || !chromeOpen) return;
		hideOptions();
		hideSuggestPanel();
		closeActiveMenu();
		activeMenu = menu;
		menu.onHide(() => {
			if (activeMenu === menu) activeMenu = null;
		});
		const rect = wrapper.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 2 });
	};

	const showDateMenu = (kind: "due" | "scheduled") => {
		if (activeMenu) return;
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle(kind === "due" ? "截止日期" : "安排日期");
			item.setDisabled(true);
		});
		for (const preset of DATE_PRESETS) {
			menu.addItem((item) => {
				item.setTitle(preset.label);
				item.onClick(() => replaceLastWord(preset.value));
			});
		}
		showMenuSafe(menu);
	};

	const showPriorityMenu = () => {
		if (activeMenu) return;
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle("优先级");
			item.setDisabled(true);
		});
		for (const preset of PRIORITY_PRESETS) {
			menu.addItem((item) => {
				item.setTitle(preset.label);
				item.onClick(() => replaceLastWord(preset.value));
			});
		}
		showMenuSafe(menu);
	};

	const renderSuggestPanel = () => {
		clearChildren(suggestMenu);
		if (!suggestPanel) return;

		const panel = el("div", {
			cls: "todo-search-dropdown-panel todo-search-suggestion-panel",
			parent: suggestMenu,
		});
		const section = el("div", { cls: "todo-search-dropdown__section", parent: panel });
		el("div", {
			cls: "todo-search-dropdown__header",
			text: suggestPanel === "folder" ? "搜索文件夹" : "标签",
			parent: section,
		});

		const filterInput = el("input", {
			cls: "todo-search-dropdown__filter",
			parent: section,
			attr: {
				type: "text",
				placeholder:
					suggestPanel === "folder" ? "搜索要包含的文件夹..." : "过滤标签…",
			},
		});
		filterInput.value = suggestQuery;
		filterInput.addEventListener("mousedown", (event) => event.stopPropagation());
		filterInput.addEventListener("input", () => {
			suggestQuery = filterInput.value;
			const keep = filterInput.selectionStart ?? filterInput.value.length;
			renderSuggestPanel();
			positionPortal(suggestMenu);
			const next = suggestMenu.querySelector(".todo-search-dropdown__filter");
			if (next instanceof HTMLInputElement) {
				next.focus();
				next.setSelectionRange(keep, keep);
			}
		});

		const list = el("div", { cls: "todo-search-dropdown__list", parent: section });
		const q = suggestQuery.trim().toLowerCase();
		let items: Array<{ value: string; label: string }> = [];

		if (suggestPanel === "folder") {
			items = collectFolders(hosts.app)
				.map((path) => ({
					value: path,
					label: path === "/" ? "/ (Vault 根目录)" : path,
				}))
				.filter((item) => !q || item.label.toLowerCase().includes(q));
		} else {
			items = collectVaultTags(hosts.app, hosts.getTags())
				.map((tag) => ({ value: tag.replace(/^#/, ""), label: tag }))
				.filter((item) => !q || item.label.toLowerCase().includes(q));
		}

		if (!items.length) {
			el("div", { cls: "todo-search-dropdown__empty", text: "没有可选项", parent: list });
		} else {
			for (const item of items.slice(0, 200)) {
				const row = el("button", {
					cls: "todo-search-dropdown__item",
					parent: list,
					attr: { type: "button" },
				});
				el("span", { cls: "todo-search-dropdown__label", text: item.label, parent: row });
				row.addEventListener("mousedown", (event) => {
					event.preventDefault();
					const encoded = /[\s"]/.test(item.value) ? `"${item.value}"` : item.value;
					replaceLastWord(encoded);
					hideSuggestPanel();
				});
			}
		}

		window.setTimeout(() => {
			if (!destroyed && !suggestMenu.hidden) filterInput.focus();
		}, 0);
	};

	const openSuggestPanel = (kind: SuggestPanel) => {
		if (!kind) return;
		hideOptions();
		closeActiveMenu();
		suggestPanel = kind;
		suggestQuery = "";
		renderSuggestPanel();
		positionPortal(suggestMenu);
		suggestMenu.hidden = false;
	};

	const runAfterInsert = (prefix: string) => {
		if (prefix === "due:") showDateMenu("due");
		else if (prefix === "scheduled:") showDateMenu("scheduled");
		else if (prefix === "priority:") showPriorityMenu();
		else if (prefix === "folder:") openSuggestPanel("folder");
		else if (prefix === "tag:") openSuggestPanel("tags");
		// path: — type freely, no picker
	};

	/**
	 * Weave checkAndShowSuggestions: only bare prefixes ending with `field:`
	 * open a suggester. `due:today` must close menus, not keep them open.
	 */
	const checkAndShowSuggestions = () => {
		const token = getCurrentToken();
		const lower = token.toLowerCase();

		if (lower.endsWith("folder:") || lower === "folder:") {
			openSuggestPanel("folder");
			return;
		}
		if (lower.endsWith("tag:") || lower === "tag:") {
			openSuggestPanel("tags");
			return;
		}
		if (lower.endsWith("due:")) {
			showDateMenu("due");
			return;
		}
		if (lower.endsWith("scheduled:")) {
			showDateMenu("scheduled");
			return;
		}
		if (lower.endsWith("priority:")) {
			showPriorityMenu();
			return;
		}

		// Completed / free-text token → close field menus (options stay user's choice).
		closeActiveMenu();
		if (suggestPanel) hideSuggestPanel();
	};

	input.addEventListener("input", () => {
		emit();
		checkAndShowSuggestions();
	});

	input.addEventListener("focus", () => {
		if (!chromeOpen) return;
		// Focus opens options only when no field suggester is active.
		if (!activeMenu && !suggestPanel) showOptions();
	});

	input.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			dismissSuggest();
			input.blur();
			event.preventDefault();
			return;
		}
		if (event.key === "Enter") {
			dismissSuggest();
			return;
		}
		if (event.key === ":") {
			window.setTimeout(() => checkAndShowSuggestions(), 50);
		}
	});

	clearBtn.addEventListener("mousedown", (event) => event.preventDefault());
	clearBtn.addEventListener("click", () => {
		dismissSuggest();
		input.value = "";
		matchCount.hidden = true;
		emit();
		input.focus();
		showOptions();
	});

	const onDocMouseDown = (event: MouseEvent) => {
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (root.contains(target)) return;
		if (optionsMenu.contains(target) || suggestMenu.contains(target)) return;
		// Obsidian Menu lives under body `.menu` — don't treat as outside for options close timing.
		if (target.instanceOf(Element) && target.closest(".menu")) return;
		hideOptions();
		hideSuggestPanel();
	};
	document.addEventListener("mousedown", onDocMouseDown, true);

	const onScrollOrResize = () => {
		if (!optionsMenu.hidden) positionPortal(optionsMenu);
		if (!suggestMenu.hidden) positionPortal(suggestMenu);
	};
	window.addEventListener("resize", onScrollOrResize);
	document.addEventListener("scroll", onScrollOrResize, true);

	return {
		root,
		input,
		setMatchCount(matched, total, query) {
			if (!query.trim()) {
				matchCount.hidden = true;
				matchCount.textContent = "";
				return;
			}
			matchCount.hidden = false;
			matchCount.textContent = total >= 0 ? `${matched}/${total}` : String(matched);
		},
		setOpen(next) {
			chromeOpen = next;
			root.classList.toggle("is-open", next);
			if (!next) dismissSuggest();
		},
		dismissSuggest,
		focus() {
			if (!chromeOpen) return;
			input.focus();
			if (!activeMenu && !suggestPanel) showOptions();
		},
		clear() {
			input.value = "";
			syncChrome();
			matchCount.hidden = true;
			dismissSuggest();
			hosts.onQueryChange("");
		},
		destroy() {
			destroyed = true;
			dismissSuggest();
			document.removeEventListener("mousedown", onDocMouseDown, true);
			window.removeEventListener("resize", onScrollOrResize);
			document.removeEventListener("scroll", onScrollOrResize, true);
			optionsMenu.remove();
			suggestMenu.remove();
			purgePortals();
		},
	};
}
