import type { ParsedTask } from "../types";
import { addDays, parseLocalDateKey, startOfWeekMonday } from "../utils/dates";

export interface OverdueSection {
	id: string;
	title: string;
	tasks: ParsedTask[];
}

function startOfYear(dayKey: string): string {
	const date = parseLocalDateKey(dayKey);
	return `${date.getFullYear()}-01-01`;
}

/**
 * Progressive overdue sections (newest overdue last):
 * 去年及更久 → 更早 → 最近一个月 → 上周 → 本周更早
 */
export function groupOverdueTasks(tasks: ParsedTask[], today: string): OverdueSection[] {
	const yearStart = startOfYear(today);
	const monthAgo = addDays(today, -30);
	const thisWeekStart = startOfWeekMonday(today);
	const lastWeekStart = addDays(thisWeekStart, -7);

	const buckets: OverdueSection[] = [
		{ id: "older-than-year", title: "去年及更久", tasks: [] },
		{ id: "earlier", title: "更早", tasks: [] },
		{ id: "past-month", title: "最近一个月", tasks: [] },
		{ id: "last-week", title: "上周", tasks: [] },
		{ id: "earlier-this-week", title: "本周更早", tasks: [] },
	];

	const sorted = [...tasks].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
	for (const task of sorted) {
		const due = task.due;
		if (!due || due >= today) continue;
		if (due < yearStart) {
			buckets[0]!.tasks.push(task);
		} else if (due < monthAgo) {
			buckets[1]!.tasks.push(task);
		} else if (due < lastWeekStart) {
			buckets[2]!.tasks.push(task);
		} else if (due < thisWeekStart) {
			buckets[3]!.tasks.push(task);
		} else {
			buckets[4]!.tasks.push(task);
		}
	}

	return buckets.filter((b) => b.tasks.length > 0);
}
