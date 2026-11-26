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

	const olderThanYear: OverdueSection = { id: "older-than-year", title: "去年及更久", tasks: [] };
	const earlier: OverdueSection = { id: "earlier", title: "更早", tasks: [] };
	const pastMonth: OverdueSection = { id: "past-month", title: "最近一个月", tasks: [] };
	const lastWeek: OverdueSection = { id: "last-week", title: "上周", tasks: [] };
	const earlierThisWeek: OverdueSection = { id: "earlier-this-week", title: "本周更早", tasks: [] };

	const sorted = [...tasks].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
	for (const task of sorted) {
		const due = task.due;
		if (!due || due >= today) continue;
		if (due < yearStart) {
			olderThanYear.tasks.push(task);
		} else if (due < monthAgo) {
			earlier.tasks.push(task);
		} else if (due < lastWeekStart) {
			pastMonth.tasks.push(task);
		} else if (due < thisWeekStart) {
			lastWeek.tasks.push(task);
		} else {
			earlierThisWeek.tasks.push(task);
		}
	}

	return [olderThanYear, earlier, pastMonth, lastWeek, earlierThisWeek].filter(
		(bucket) => bucket.tasks.length > 0,
	);
}
