import type { ParsedTask } from "../types";
import { toLocalDateKey, addDays, isOverdue } from "../utils/dates";

export interface ParsedSearchQuery {
	text: string;
	due: string | null;
	scheduled: string | null;
	tag: string | null;
	folder: string | null;
	path: string | null;
	priority: string | null;
}

const PREFIX_WITH_VALUE_RE =
	/\b(due|scheduled|tag|folder|path|priority):\s*("([^"]*)"|'([^']*)'|(\S+))/gi;

/** Bare prefixes still being typed, e.g. `due:` or `tag:` — must not filter results. */
const BARE_PREFIX_RE = /\b(due|scheduled|tag|folder|path|priority):\s*/gi;

export function parseSearchQuery(raw: string): ParsedSearchQuery {
	const result: ParsedSearchQuery = {
		text: raw,
		due: null,
		scheduled: null,
		tag: null,
		folder: null,
		path: null,
		priority: null,
	};

	let rest = raw.replace(
		PREFIX_WITH_VALUE_RE,
		(_, key: string, _all: string, dq?: string, sq?: string, bare?: string) => {
			const value = (dq ?? sq ?? bare ?? "").trim();
			if (!value) return " ";
			const k = key.toLowerCase();
			if (k === "due") result.due = value;
			else if (k === "scheduled") result.scheduled = value;
			else if (k === "tag") result.tag = value.replace(/^#/, "");
			else if (k === "folder") result.folder = value.replace(/\\/g, "/").replace(/\/$/, "");
			else if (k === "path") result.path = value.replace(/\\/g, "/");
			else if (k === "priority") result.priority = value.toLowerCase();
			return " ";
		},
	);

	// Drop incomplete prefixes so `due:` alone does not become a text needle.
	rest = rest.replace(BARE_PREFIX_RE, " ");
	result.text = rest.replace(/\s+/g, " ").trim();
	return result;
}

function matchDateField(value: string | null, token: string, today: string): boolean {
	if (!token) return true;
	const t = token.toLowerCase();
	if (t === "today") return value === today;
	if (t === "tomorrow") return value === addDays(today, 1);
	if (t === "overdue") return isOverdue(value, today, false);
	if (t === "thisweek") {
		if (!value) return false;
		const end = addDays(today, 7);
		return value >= today && value < end;
	}
	return (value ?? "").includes(token);
}

export function filterTasksBySearch(tasks: ParsedTask[], rawQuery: string): ParsedTask[] {
	const q = parseSearchQuery(rawQuery);
	const text = q.text.toLowerCase();
	const today = toLocalDateKey();

	return tasks.filter((task) => {
		if (q.due && !matchDateField(task.due, q.due, today)) return false;
		if (q.scheduled && !matchDateField(task.scheduled, q.scheduled, today)) return false;
		if (q.tag) {
			const needle = q.tag.toLowerCase();
			if (!task.tags.some((t) => t.toLowerCase().includes(needle) || t.toLowerCase() === `#${needle}`)) {
				return false;
			}
		}
		if (q.folder) {
			const path = task.path.replace(/\\/g, "/");
			const folder = q.folder === "/" ? "" : q.folder;
			if (folder === "") return true; // vault root = all
			if (!(path === folder || path.startsWith(`${folder}/`))) return false;
		}
		if (q.path && !task.path.replace(/\\/g, "/").toLowerCase().includes(q.path.toLowerCase())) {
			return false;
		}
		if (q.priority && (task.priority ?? "") !== q.priority) return false;
		if (!text) return true;
		const hay = `${task.title} ${task.path} ${task.tags.join(" ")}`.toLowerCase();
		return hay.includes(text);
	});
}

/** Labels aligned with Weave Review「搜索选项」panel. */
export const SEARCH_FIELD_OPTIONS: Array<{ prefix: string; label: string }> = [
	{ prefix: "due:", label: "due: 搜索截止日期" },
	{ prefix: "scheduled:", label: "scheduled: 搜索安排日期" },
	{ prefix: "tag:", label: "tag: 搜索标签" },
	{ prefix: "folder:", label: "folder: 搜索文件夹" },
	{ prefix: "path:", label: "path: 搜索路径" },
	{ prefix: "priority:", label: "priority: 搜索优先级" },
];
