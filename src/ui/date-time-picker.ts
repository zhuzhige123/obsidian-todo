import { setIcon } from "obsidian";
import {
	addDays,
	formatDueCapsule,
	formatMonthTitle,
	normalizeTimeInput,
	parseLocalDateKey,
	toLocalDateKey,
} from "../utils/dates";
import { el, clearChildren } from "./dom";

export interface DueSelection {
	due: string | null;
	dueTime: string | null;
}

export interface DateTimePickerLabels {
	setDue: string;
	clearDueAria: string;
	closePanel: string;
	prevMonth: string;
	nextMonth: string;
}

export interface DueControlOptions {
	parent: HTMLElement;
	value: DueSelection;
	labels: DateTimePickerLabels;
	onChange: (next: DueSelection) => void;
	/** Extra class on the control root (e.g. draft vs row). */
	cls?: string | string[];
}

interface Cell {
	iso: string;
	num: number;
	outside: boolean;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const PANEL_WIDTH_PX = 300;
const PLACEHOLDER_HOUR = 12;
const PLACEHOLDER_MINUTE = 0;

let activeCloser: (() => void) | null = null;
let panelCloseListener: (() => void) | null = null;

function safeSetIcon(node: HTMLElement, name: string): void {
	try {
		setIcon(node, name);
	} catch {
		node.textContent = "";
	}
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function wrapHour(n: number): number {
	return ((n % 24) + 24) % 24;
}

function wrapMinute(n: number): number {
	return ((n % 60) + 60) % 60;
}

export function isDateTimePanelOpen(): boolean {
	return activeCloser != null;
}

/** Fired once after the active panel fully closes (Esc / outside / toggle). */
export function setDateTimePanelCloseListener(listener: (() => void) | null): void {
	panelCloseListener = listener;
}

export function closeActiveDateTimePanel(): void {
	activeCloser?.();
}

function buildMonthCells(year: number, monthIndex: number): Cell[] {
	const first = new Date(year, monthIndex, 1);
	const startPad = first.getDay();
	const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
	const cells: Cell[] = [];

	for (let i = 0; i < startPad; i++) {
		const prev = new Date(year, monthIndex, -startPad + i + 1);
		cells.push({
			iso: toLocalDateKey(prev),
			num: prev.getDate(),
			outside: true,
		});
	}
	for (let d = 1; d <= daysInMonth; d++) {
		const date = new Date(year, monthIndex, d);
		cells.push({ iso: toLocalDateKey(date), num: d, outside: false });
	}
	while (cells.length % 7 !== 0) {
		const padNum = cells.length - startPad - daysInMonth + 1;
		const date = new Date(year, monthIndex + 1, padNum);
		cells.push({ iso: toLocalDateKey(date), num: date.getDate(), outside: true });
	}
	return cells;
}

function placePanel(panel: HTMLElement, anchor: HTMLElement): void {
	const rect = anchor.getBoundingClientRect();
	const width = PANEL_WIDTH_PX;
	const pad = 8;
	let left = rect.left;
	if (left + width > window.innerWidth - pad) {
		left = Math.max(pad, window.innerWidth - width - pad);
	}
	if (left < pad) left = pad;

	panel.style.width = `${width}px`;
	panel.style.left = `${Math.round(left)}px`;

	const estimatedHeight = 360;
	const below = rect.bottom + 8;
	const above = rect.top - estimatedHeight - 8;
	const top =
		below + estimatedHeight <= window.innerHeight - pad
			? below
			: Math.max(pad, above);
	panel.style.top = `${Math.round(top)}px`;
}

function openDateTimePanel(
	anchor: HTMLElement,
	initial: DueSelection,
	labels: DateTimePickerLabels,
	onChange: (next: DueSelection) => void,
): void {
	closeActiveDateTimePanel();

	const today = toLocalDateKey();

	let value: DueSelection = {
		due: initial.due,
		dueTime: initial.due ? initial.dueTime : null,
	};
	let cursor = value.due ?? today;
	let viewMonth = parseLocalDateKey(cursor);

	/** Editing HH:MM UI open (placeholder clicked or time already set). */
	let timeEditing = !!value.dueTime;
	/** True once the user mutates HH/MM; placeholder open alone must not write. */
	let timeDirty = !!value.dueTime;
	/** Local draft values while editing; only emit after user mutates. */
	let draftHour = value.dueTime
		? Number.parseInt(value.dueTime.slice(0, 2), 10)
		: PLACEHOLDER_HOUR;
	let draftMinute = value.dueTime
		? Number.parseInt(value.dueTime.slice(3, 5), 10)
		: PLACEHOLDER_MINUTE;
	if (!Number.isFinite(draftHour)) draftHour = PLACEHOLDER_HOUR;
	if (!Number.isFinite(draftMinute)) draftMinute = PLACEHOLDER_MINUTE;

	const panel = el("div", {
		cls: "todo-dt-panel",
		attr: { role: "dialog", "aria-label": labels.setDue },
	});
	document.body.appendChild(panel);

	const monthBar = el("div", { cls: "todo-dt-panel__month", parent: panel });
	const weekdays = el("div", { cls: "todo-dt-panel__weekdays", parent: panel });
	for (const w of WEEKDAYS) {
		el("div", { cls: "todo-dt-panel__weekday", text: w, parent: weekdays });
	}
	const grid = el("div", { cls: "todo-dt-panel__grid", parent: panel });
	const footer = el("div", { cls: "todo-dt-panel__footer", parent: panel });

	const emit = (next: DueSelection, opts?: { rerenderTime?: boolean }): void => {
		value = {
			due: next.due,
			dueTime: next.due ? next.dueTime : null,
		};
		if (!value.due) {
			timeEditing = false;
			timeDirty = false;
			draftHour = PLACEHOLDER_HOUR;
			draftMinute = PLACEHOLDER_MINUTE;
		}
		onChange(value);
		renderMonth();
		renderGrid();
		if (opts?.rerenderTime !== false) renderTime();
		placePanel(panel, anchor);
	};

	const close = (): void => {
		if (activeCloser !== close) return;
		activeCloser = null;
		document.removeEventListener("pointerdown", onPointerDown, true);
		document.removeEventListener("keydown", onKeyDown, true);
		window.removeEventListener("resize", onReposition);
		window.removeEventListener("scroll", onReposition, true);
		panel.remove();
		panelCloseListener?.();
	};
	activeCloser = close;

	const onReposition = (): void => placePanel(panel, anchor);
	const onPointerDown = (event: PointerEvent): void => {
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (panel.contains(target) || anchor.contains(target)) return;
		close();
	};
	const onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
			return;
		}

		const target = event.target;
		if (
			target instanceof HTMLElement &&
			target.closest(".todo-dt-panel__time")
		) {
			return;
		}

		if (event.key === "ArrowLeft") {
			event.preventDefault();
			cursor = addDays(cursor, -1);
			viewMonth = parseLocalDateKey(cursor);
			renderMonth();
			renderGrid();
			return;
		}
		if (event.key === "ArrowRight") {
			event.preventDefault();
			cursor = addDays(cursor, 1);
			viewMonth = parseLocalDateKey(cursor);
			renderMonth();
			renderGrid();
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			cursor = addDays(cursor, -7);
			viewMonth = parseLocalDateKey(cursor);
			renderMonth();
			renderGrid();
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			cursor = addDays(cursor, 7);
			viewMonth = parseLocalDateKey(cursor);
			renderMonth();
			renderGrid();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			emit({ due: cursor, dueTime: value.dueTime }, { rerenderTime: false });
			renderGrid();
		}
	};

	document.addEventListener("pointerdown", onPointerDown, true);
	document.addEventListener("keydown", onKeyDown, true);
	window.addEventListener("resize", onReposition);
	window.addEventListener("scroll", onReposition, true);

	const commitDraftTime = (): void => {
		if (!timeDirty) return;
		const normalized = normalizeTimeInput(pad2(draftHour), pad2(draftMinute));
		const due = value.due ?? today;
		cursor = due;
		viewMonth = parseLocalDateKey(due);
		emit({ due, dueTime: normalized }, { rerenderTime: false });
		renderMonth();
		renderGrid();
	};

	const syncTimeInputs = (): void => {
		const hourEl = footer.querySelector<HTMLInputElement>(
			".todo-dt-panel__time-input[data-part='hour']",
		);
		const minuteEl = footer.querySelector<HTMLInputElement>(
			".todo-dt-panel__time-input[data-part='minute']",
		);
		if (hourEl) hourEl.value = pad2(draftHour);
		if (minuteEl) minuteEl.value = pad2(draftMinute);
	};

	const bumpPart = (part: "hour" | "minute", delta: number): void => {
		if (part === "hour") draftHour = wrapHour(draftHour + delta);
		else draftMinute = wrapMinute(draftMinute + delta);
		timeDirty = true;
		commitDraftTime();
		syncTimeInputs();
	};

	const renderMonth = (): void => {
		clearChildren(monthBar);
		const prev = el("button", {
			cls: ["todo-dt-panel__nav", "clickable-icon"],
			parent: monthBar,
			attr: {
				type: "button",
				"aria-label": labels.prevMonth,
				title: labels.prevMonth,
			},
		});
		safeSetIcon(prev, "chevron-left");
		prev.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
			renderMonth();
			renderGrid();
			placePanel(panel, anchor);
		});

		el("div", {
			cls: "todo-dt-panel__month-title",
			text: formatMonthTitle(viewMonth),
			parent: monthBar,
		});

		const next = el("button", {
			cls: ["todo-dt-panel__nav", "clickable-icon"],
			parent: monthBar,
			attr: {
				type: "button",
				"aria-label": labels.nextMonth,
				title: labels.nextMonth,
			},
		});
		safeSetIcon(next, "chevron-right");
		next.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
			renderMonth();
			renderGrid();
			placePanel(panel, anchor);
		});
	};

	const renderGrid = (): void => {
		clearChildren(grid);
		const cells = buildMonthCells(viewMonth.getFullYear(), viewMonth.getMonth());
		for (const cell of cells) {
			const btn = el("button", {
				cls: [
					"todo-dt-panel__day",
					"clickable-icon",
					cell.outside ? "is-outside" : "",
					cell.iso === today ? "is-today" : "",
					cell.iso === value.due ? "is-selected" : "",
					cell.iso === cursor ? "is-cursor" : "",
				],
				text: String(cell.num),
				parent: grid,
				attr: {
					type: "button",
					"data-iso": cell.iso,
					"aria-label": cell.iso,
					"aria-pressed": String(cell.iso === value.due),
				},
			});
			btn.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				cursor = cell.iso;
				if (cell.outside) viewMonth = parseLocalDateKey(cell.iso);
				emit({ due: cell.iso, dueTime: value.dueTime });
			});
		}
	};

	const createSpin = (
		part: "hour" | "minute",
		input: HTMLInputElement,
	): HTMLElement => {
		const spin = el("div", { cls: "todo-dt-panel__spin" });
		const up = el("button", {
			cls: ["todo-dt-panel__spin-btn", "clickable-icon"],
			parent: spin,
			attr: { type: "button", tabindex: "-1", "aria-label": "＋" },
		});
		safeSetIcon(up, "chevron-up");
		const down = el("button", {
			cls: ["todo-dt-panel__spin-btn", "clickable-icon"],
			parent: spin,
			attr: { type: "button", tabindex: "-1", "aria-label": "－" },
		});
		safeSetIcon(down, "chevron-down");

		const onSpin = (delta: number) => (event: MouseEvent): void => {
			event.preventDefault();
			event.stopPropagation();
			bumpPart(part, delta);
			input.focus();
		};
		/* mousedown preventDefault keeps the HH/MM input focused (no blur collapse). */
		up.addEventListener("mousedown", (event) => event.preventDefault());
		down.addEventListener("mousedown", (event) => event.preventDefault());
		up.addEventListener("click", onSpin(1));
		down.addEventListener("click", onSpin(-1));
		return spin;
	};

	const renderTime = (): void => {
		clearChildren(footer);
		const timeWrap = el("div", { cls: "todo-dt-panel__time", parent: footer });

		const showEditor = timeEditing || !!value.dueTime;
		if (!showEditor) {
			const placeholder = el("button", {
				cls: ["todo-dt-panel__time-placeholder", "clickable-icon"],
				text: "12:00",
				parent: timeWrap,
				attr: { type: "button", "aria-label": "12:00" },
			});
			placeholder.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				timeEditing = true;
				timeDirty = false;
				draftHour = PLACEHOLDER_HOUR;
				draftMinute = PLACEHOLDER_MINUTE;
				if (!value.due) {
					cursor = today;
					viewMonth = parseLocalDateKey(today);
					/* Opening the editor must not write time; only ensure a date exists. */
					emit({ due: today, dueTime: null }, { rerenderTime: false });
					renderMonth();
					renderGrid();
				}
				renderTime();
				window.setTimeout(() => {
					footer
						.querySelector<HTMLInputElement>(
							".todo-dt-panel__time-input[data-part='hour']",
						)
						?.focus();
				}, 0);
			});
		} else {
			if (value.dueTime) {
				draftHour = Number.parseInt(value.dueTime.slice(0, 2), 10) || draftHour;
				draftMinute = Number.parseInt(value.dueTime.slice(3, 5), 10) || draftMinute;
				timeDirty = true;
			}

			const hourField = el("div", {
				cls: ["todo-dt-panel__time-field", "todo-dt-panel__time-field--hour"],
				parent: timeWrap,
			});
			const hourInput = el("input", {
				cls: "todo-dt-panel__time-input",
				attr: {
					type: "text",
					inputmode: "numeric",
					maxlength: "2",
					placeholder: "HH",
					"data-part": "hour",
					"aria-label": "HH",
					value: pad2(draftHour),
				},
			}) as HTMLInputElement;
			/* Hour steppers sit to the LEFT of the hour input. */
			hourField.appendChild(createSpin("hour", hourInput));
			hourField.appendChild(hourInput);

			el("span", {
				cls: "todo-dt-panel__time-sep",
				text: ":",
				parent: timeWrap,
			});

			const minuteField = el("div", {
				cls: ["todo-dt-panel__time-field", "todo-dt-panel__time-field--minute"],
				parent: timeWrap,
			});
			const minuteInput = el("input", {
				cls: "todo-dt-panel__time-input",
				parent: minuteField,
				attr: {
					type: "text",
					inputmode: "numeric",
					maxlength: "2",
					placeholder: "MM",
					"data-part": "minute",
					"aria-label": "MM",
					value: pad2(draftMinute),
				},
			}) as HTMLInputElement;
			minuteField.appendChild(createSpin("minute", minuteInput));

			const applyFromInputs = (forceDirty = true): void => {
				const hRaw = Number.parseInt(hourInput.value, 10);
				const mRaw = Number.parseInt(minuteInput.value, 10);
				if (Number.isFinite(hRaw)) draftHour = wrapHour(hRaw);
				if (Number.isFinite(mRaw)) draftMinute = wrapMinute(mRaw);
				hourInput.value = pad2(draftHour);
				minuteInput.value = pad2(draftMinute);
				if (forceDirty) timeDirty = true;
				commitDraftTime();
			};

			for (const [input, part] of [
				[hourInput, "hour"],
				[minuteInput, "minute"],
			] as const) {
				input.addEventListener("click", (event) => event.stopPropagation());
				input.addEventListener("pointerdown", (event) => event.stopPropagation());
				input.addEventListener("wheel", (event) => {
					event.preventDefault();
					event.stopPropagation();
					bumpPart(part, event.deltaY < 0 ? 1 : -1);
				}, { passive: false });
				input.addEventListener("keydown", (event) => {
					event.stopPropagation();
					if (event.key === "ArrowUp") {
						event.preventDefault();
						bumpPart(part, 1);
						return;
					}
					if (event.key === "ArrowDown") {
						event.preventDefault();
						bumpPart(part, -1);
						return;
					}
					if (event.key === "Enter") {
						event.preventDefault();
						applyFromInputs(true);
					}
					if (event.key === "Escape") {
						event.preventDefault();
						close();
					}
				});
				input.addEventListener("change", () => applyFromInputs(true));
				input.addEventListener("blur", () => {
					window.setTimeout(() => {
						const active = document.activeElement;
						if (active instanceof Node && timeWrap.contains(active)) return;
						if (!timeDirty) {
							timeEditing = false;
							renderTime();
							return;
						}
						applyFromInputs(true);
					}, 0);
				});
			}

			hourInput.addEventListener("input", () => {
				const digits = hourInput.value.replace(/\D/g, "").slice(0, 2);
				if (digits !== hourInput.value) hourInput.value = digits;
				if (digits.length > 0) timeDirty = true;
				if (digits.length === 2) minuteInput.focus();
			});
			minuteInput.addEventListener("input", () => {
				const digits = minuteInput.value.replace(/\D/g, "").slice(0, 2);
				if (digits !== minuteInput.value) minuteInput.value = digits;
				if (digits.length > 0) timeDirty = true;
			});

		}

		const closeBtn = el("button", {
			cls: ["todo-dt-panel__close", "clickable-icon"],
			parent: footer,
			attr: {
				type: "button",
				title: labels.closePanel,
				"aria-label": labels.closePanel,
			},
		});
		safeSetIcon(closeBtn, "x");
		closeBtn.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			close();
		});
	};

	renderMonth();
	renderGrid();
	renderTime();
	placePanel(panel, anchor);
}

/** Calendar icon + optional date capsule + clear; opens shared date/time panel. */
export function renderDueControl(options: DueControlOptions): HTMLElement {
	const { labels } = options;
	let value: DueSelection = {
		due: options.value.due,
		dueTime: options.value.due ? options.value.dueTime : null,
	};

	const root = el("div", {
		cls: [
			"todo-due-ctl",
			...(Array.isArray(options.cls)
				? options.cls
				: options.cls
					? [options.cls]
					: []),
		],
		parent: options.parent,
	});

	const trigger = el("button", {
		cls: ["todo-due-ctl__trigger", "clickable-icon"],
		parent: root,
		attr: {
			type: "button",
			title: labels.setDue,
			"aria-label": labels.setDue,
			"aria-haspopup": "dialog",
		},
	});
	const icon = el("span", { cls: "todo-due-ctl__icon", parent: trigger });
	safeSetIcon(icon, "calendar");

	const capsule = el("span", {
		cls: "todo-due-ctl__capsule",
		parent: root,
		attr: { hidden: "true" },
	});

	const clearBtn = el("button", {
		cls: ["todo-due-ctl__clear", "clickable-icon"],
		parent: root,
		attr: {
			type: "button",
			title: labels.clearDueAria,
			"aria-label": labels.clearDueAria,
			hidden: "true",
		},
	});
	safeSetIcon(clearBtn, "x");

	const sync = (): void => {
		const hasDue = !!value.due;
		root.classList.toggle("has-due", hasDue);
		trigger.classList.toggle("has-due", hasDue);
		if (hasDue && value.due) {
			capsule.hidden = false;
			capsule.textContent = formatDueCapsule(value.due, value.dueTime);
			clearBtn.hidden = false;
		} else {
			capsule.hidden = true;
			capsule.textContent = "";
			clearBtn.hidden = true;
		}
	};

	const apply = (next: DueSelection): void => {
		value = {
			due: next.due,
			dueTime: next.due ? next.dueTime : null,
		};
		sync();
		options.onChange(value);
	};

	trigger.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (activeCloser) {
			closeActiveDateTimePanel();
			return;
		}
		openDateTimePanel(trigger, value, labels, (next) => {
			apply(next);
		});
	});

	clearBtn.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		closeActiveDateTimePanel();
		apply({ due: null, dueTime: null });
	});

	sync();
	return root;
}
