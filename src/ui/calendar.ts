import type { CalendarDensity } from "../types";
import type { DayMarker } from "../services/task-queries";
import { parseLocalDateKey, toLocalDateKey } from "../utils/dates";
import { el, clearChildren } from "./dom";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export interface CalendarRenderOptions {
	month: Date;
	selected: string;
	today: string;
	density: CalendarDensity;
	getMarkers: (day: string) => DayMarker[];
	onSelect: (day: string) => void;
}

interface Cell {
	iso: string;
	num: number;
	outside: boolean;
	row: number;
}

function toIso(d: Date): string {
	return toLocalDateKey(d);
}

function buildMonthCells(year: number, monthIndex: number): Cell[] {
	const first = new Date(year, monthIndex, 1);
	const startPad = first.getDay();
	const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
	const cells: Cell[] = [];

	for (let i = 0; i < startPad; i++) {
		const prev = new Date(year, monthIndex, -startPad + i + 1);
		cells.push({ iso: toIso(prev), num: prev.getDate(), outside: true, row: 0 });
	}
	for (let d = 1; d <= daysInMonth; d++) {
		const date = new Date(year, monthIndex, d);
		cells.push({
			iso: toIso(date),
			num: d,
			outside: false,
			row: Math.floor((startPad + d - 1) / 7),
		});
	}
	while (cells.length % 7 !== 0) {
		const padNum = cells.length - startPad - daysInMonth + 1;
		const date = new Date(year, monthIndex + 1, padNum);
		cells.push({
			iso: toIso(date),
			num: date.getDate(),
			outside: true,
			row: Math.floor(cells.length / 7),
		});
	}
	return cells;
}

export function renderCalendar(host: HTMLElement, options: CalendarRenderOptions): void {
	clearChildren(host);
	host.dataset.density = options.density;
	host.classList.add("todo-cal");

	const year = options.month.getFullYear();
	const monthIndex = options.month.getMonth();
	const cells = buildMonthCells(year, monthIndex);
	const selectedRow = cells.find((c) => c.iso === options.selected)?.row ?? 0;
	const lastRow = Math.floor((cells.length - 1) / 7);

	const weekdays = el("div", { cls: "todo-cal__weekdays", parent: host });
	for (const w of WEEKDAYS) el("div", { cls: "todo-cal__weekday", text: w, parent: weekdays });

	const days = el("div", { cls: "todo-cal__days", parent: host });
	for (const cell of cells) {
		let hidden = false;
		if (options.density === "two") {
			const rows = new Set([selectedRow, Math.min(selectedRow + 1, lastRow)]);
			if (selectedRow === lastRow) rows.add(Math.max(0, selectedRow - 1));
			hidden = !rows.has(cell.row);
		}

		const wd = WEEKDAYS[parseLocalDateKey(cell.iso).getDay()] ?? "";
		const btn = el("button", {
			cls: [
				"todo-day",
				"clickable-icon",
				cell.outside ? "is-outside" : "",
				cell.iso === options.today ? "is-today" : "",
				cell.iso === options.selected ? "is-selected" : "",
				hidden ? "is-hidden-row" : "",
			],
			parent: days,
			attr: {
				type: "button",
				"data-iso": cell.iso,
				"aria-label": cell.iso,
				"aria-pressed": String(cell.iso === options.selected),
			},
		});
		el("span", { cls: "todo-day__num", text: String(cell.num), parent: btn });
		el("span", { cls: "todo-day__wd", text: `周${wd}`, parent: btn });
		const dots = el("span", { cls: "todo-day__dots", parent: btn });
		for (const marker of options.getMarkers(cell.iso)) {
			el("i", { cls: ["todo-dot", `todo-dot--${marker}`], parent: dots });
		}
		btn.addEventListener("click", () => options.onSelect(cell.iso));
	}

	if (options.density === "one") {
		const selectedBtn = days.querySelector(".todo-day.is-selected");
		selectedBtn?.scrollIntoView({ inline: "center", block: "nearest" });
	}
}
