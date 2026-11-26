import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeTaskStats } from "./task-stats";
import type { ParsedTask } from "../types";

function task(partial: Partial<ParsedTask> & Pick<ParsedTask, "title">): ParsedTask {
	return {
		id: partial.title,
		path: "a.md",
		line: 0,
		raw: `- [ ] ${partial.title}`,
		completed: false,
		due: null,
		scheduled: null,
		created: null,
		doneDate: null,
		priority: null,
		recurring: false,
		hasDescription: false,
		tags: [],
		...partial,
	};
}

describe("computeTaskStats", () => {
	it("aggregates status shares, tags, and attention", () => {
		const today = "2026-11-26";
		const stats = computeTaskStats(
			[
				task({ title: "done", completed: true, doneDate: "2026-11-26", tags: ["#工作"] }),
				task({ title: "done2", completed: true, doneDate: "2026-11-23", tags: ["#工作"] }),
				task({ title: "open", due: "2026-11-28", tags: ["#文档"] }),
				task({ title: "late", due: "2026-11-24", tags: ["#采购"] }),
				task({ title: "late2", due: "2026-11-25" }),
			],
			today,
		);

		const byId = Object.fromEntries(stats.status.map((s) => [s.id, s]));
		assert.equal(byId.completed?.count, 2);
		assert.equal(byId.inProgress?.count, 1);
		assert.equal(byId.overdue?.count, 2);
		assert.equal(byId.completed?.percent, 40);
		assert.equal(byId.inProgress?.percent, 20);
		assert.equal(byId.overdue?.percent, 40);

		assert.equal(stats.tags[0]?.label, "工作");
		assert.equal(stats.tags[0]?.count, 2);
		assert.equal(stats.attention[0]?.task.title, "late");
		assert.equal(stats.attention[0]?.overdueDays, 2);
		assert.equal(stats.attention[1]?.overdueDays, 1);
	});

	it("returns empty-safe zeros when there are no tasks", () => {
		const stats = computeTaskStats([], "2026-11-26");
		assert.equal(stats.total, 0);
		assert.deepEqual(
			stats.status.map((s) => s.percent),
			[0, 0, 0],
		);
		assert.equal(stats.tags.length, 0);
		assert.equal(stats.attention.length, 0);
	});
});
