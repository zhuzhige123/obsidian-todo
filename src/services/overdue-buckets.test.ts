import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupOverdueTasks } from "./overdue-buckets";
import type { ParsedTask } from "../types";

function task(due: string, title = due): ParsedTask {
	return {
		id: title,
		path: "a.md",
		line: 0,
		raw: `- [ ] ${title}`,
		completed: false,
		title,
		due,
		scheduled: null,
		created: null,
		doneDate: null,
		priority: null,
		recurring: false,
		hasDescription: false,
		images: [],
		indent: 0,
		depth: 0,
		parentId: null,
		childIds: [],
		tags: [],
	};
}

describe("groupOverdueTasks", () => {
	it("splits overdue tasks into progressive buckets", () => {
		const today = "2026-11-26"; // Thursday
		const sections = groupOverdueTasks(
			[
				task("2024-03-01", "old"),
				task("2026-06-01", "earlier"),
				task("2026-11-01", "month"),
				task("2026-11-18", "lastweek"), // Tue of previous week (Mon=17)
				task("2026-11-25", "thisweek"),
			],
			today,
		);
		const map = Object.fromEntries(sections.map((s) => [s.title, s.tasks.map((t) => t.title)]));
		assert.deepEqual(map["去年及更久"], ["old"]);
		assert.deepEqual(map["更早"], ["earlier"]);
		assert.deepEqual(map["最近一个月"], ["month"]);
		assert.deepEqual(map["上周"], ["lastweek"]);
		assert.deepEqual(map["本周更早"], ["thisweek"]);
	});
});
