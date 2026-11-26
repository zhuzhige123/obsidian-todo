import type { ParsedTask } from "../types";
import { isOverdue, addDays } from "../utils/dates";

export function getSuggestionBuckets(
	tasks: ParsedTask[],
	today: string,
	excludeIds: Set<string>,
	soonDays = 3,
): {
	overdue: ParsedTask[];
	dueToday: ParsedTask[];
	soon: ParsedTask[];
} {
	const open = tasks.filter((t) => !t.completed && !excludeIds.has(t.id));
	const overdue: ParsedTask[] = [];
	const dueToday: ParsedTask[] = [];
	const soon: ParsedTask[] = [];
	const soonEnd = addDays(today, soonDays);

	for (const task of open) {
		if (isOverdue(task.due, today, task.completed)) {
			overdue.push(task);
			continue;
		}
		if (task.due === today) {
			dueToday.push(task);
			continue;
		}
		if (task.due && task.due > today && task.due <= soonEnd) {
			soon.push(task);
		}
	}

	overdue.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
	dueToday.sort((a, b) => a.title.localeCompare(b.title));
	soon.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
	return { overdue, dueToday, soon };
}

export function getTasksForCalendarDay(
	tasks: ParsedTask[],
	day: string,
): ParsedTask[] {
	return tasks.filter((t) => {
		if (t.completed) return false;
		return t.due === day || t.created === day || t.scheduled === day;
	});
}

export type DayMarker = "overdue" | "due" | "created";

/** Marker meaning: overdue = due that day and still incomplete. */
export function getMarkersForDay(tasks: ParsedTask[], day: string, today: string): DayMarker[] {
	const markers = new Set<DayMarker>();
	for (const task of tasks) {
		if (task.completed) continue;
		if (task.due === day) {
			if (day < today) markers.add("overdue");
			else markers.add("due");
		}
		if (task.created === day) markers.add("created");
		if (task.scheduled === day && task.due !== day) markers.add("due");
	}
	const order: DayMarker[] = ["overdue", "due", "created"];
	return order.filter((m) => markers.has(m));
}

export function filterTasksByQuery(tasks: ParsedTask[], query: string): ParsedTask[] {
	const q = query.trim().toLowerCase();
	if (!q) return tasks;
	return tasks.filter((t) => {
		const hay = `${t.title} ${t.path} ${t.tags.join(" ")} ${t.due ?? ""} ${t.scheduled ?? ""}`.toLowerCase();
		return hay.includes(q);
	});
}

export function groupTasksByPath(tasks: ParsedTask[]): Map<string, ParsedTask[]> {
	const map = new Map<string, ParsedTask[]>();
	for (const task of tasks) {
		const list = map.get(task.path) ?? [];
		list.push(task);
		map.set(task.path, list);
	}
	return map;
}

/** Tasks may appear under each of their tags; untagged go to `untaggedKey`. */
export function groupTasksByTag(
	tasks: ParsedTask[],
	untaggedKey = "__untagged__",
): Map<string, ParsedTask[]> {
	const map = new Map<string, ParsedTask[]>();
	for (const task of tasks) {
		if (!task.tags.length) {
			const list = map.get(untaggedKey) ?? [];
			list.push(task);
			map.set(untaggedKey, list);
			continue;
		}
		for (const tag of task.tags) {
			const list = map.get(tag) ?? [];
			list.push(task);
			map.set(tag, list);
		}
	}
	return map;
}

export function sortTasksForList(tasks: ParsedTask[]): ParsedTask[] {
	return [...tasks].sort((a, b) => {
		if (a.completed !== b.completed) return a.completed ? 1 : -1;
		const due = (a.due ?? "\uffff").localeCompare(b.due ?? "\uffff");
		if (due !== 0) return due;
		return a.title.localeCompare(b.title, "zh");
	});
}
