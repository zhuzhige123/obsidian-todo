import type { ParsedTask } from "../types";
import { daysBetween, isOverdue, toLocalDateKey } from "../utils/dates";

export interface StatusShare {
	id: "completed" | "inProgress" | "overdue";
	label: string;
	count: number;
	percent: number;
}

export interface TagRankItem {
	tag: string;
	label: string;
	count: number;
	percent: number;
}

export interface AttentionItem {
	task: ParsedTask;
	overdueDays: number;
}

export interface TaskStatsSnapshot {
	today: string;
	status: StatusShare[];
	total: number;
	tags: TagRankItem[];
	attention: AttentionItem[];
}

function roundPercent(part: number, total: number): number {
	if (total <= 0 || part <= 0) return 0;
	return Math.round((part / total) * 100);
}

/**
 * Aggregate sidebar statistics from an in-memory task list.
 * Callers should pass already-filtered tasks (search scope).
 */
export function computeTaskStats(
	tasks: ParsedTask[],
	today: string = toLocalDateKey(),
	options?: { tagLimit?: number; attentionLimit?: number },
): TaskStatsSnapshot {
	const tagLimit = options?.tagLimit ?? 5;
	const attentionLimit = options?.attentionLimit ?? 8;

	let completed = 0;
	let inProgress = 0;
	let overdue = 0;
	const tagCounts = new Map<string, number>();
	const attention: AttentionItem[] = [];

	for (const task of tasks) {
		if (task.completed) {
			completed += 1;
		} else if (isOverdue(task.due, today, false)) {
			overdue += 1;
			attention.push({
				task,
				overdueDays: daysBetween(task.due!, today),
			});
		} else {
			inProgress += 1;
		}

		for (const tag of task.tags) {
			tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
		}
	}

	const total = tasks.length;
	const status: StatusShare[] = [
		{
			id: "completed",
			label: "已完成",
			count: completed,
			percent: roundPercent(completed, total),
		},
		{
			id: "inProgress",
			label: "进行中",
			count: inProgress,
			percent: roundPercent(inProgress, total),
		},
		{
			id: "overdue",
			label: "逾期",
			count: overdue,
			percent: roundPercent(overdue, total),
		},
	];

	const tags = [...tagCounts.entries()]
		.map(([tag, count]) => ({
			tag,
			label: tag.replace(/^#/, ""),
			count,
			percent: roundPercent(count, total),
		}))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh"))
		.slice(0, tagLimit);

	attention.sort((a, b) => {
		if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
		return (a.task.due ?? "").localeCompare(b.task.due ?? "");
	});

	return {
		today,
		status,
		total,
		tags,
		attention: attention.slice(0, attentionLimit),
	};
}
