import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterTasksBySearch, parseSearchQuery } from "./task-search";
import type { ParsedTask } from "../types";

function task(title: string, due: string | null = null): ParsedTask {
	return {
		id: title,
		path: "a.md",
		line: 0,
		raw: `- [ ] ${title}`,
		completed: false,
		title,
		due,
		dueTime: null,
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
		tags: ["#日记"],
	};
}

describe("parseSearchQuery", () => {
	it("ignores bare prefixes so due: alone does not become text", () => {
		const q = parseSearchQuery("due:");
		assert.equal(q.due, null);
		assert.equal(q.text, "");
	});

	it("parses due value", () => {
		const q = parseSearchQuery("due:today");
		assert.equal(q.due, "today");
		assert.equal(q.text, "");
	});
});

describe("filterTasksBySearch", () => {
	it("keeps all tasks while typing bare due:", () => {
		const tasks = [task("A", "2026-11-26"), task("B", "2026-11-20")];
		assert.equal(filterTasksBySearch(tasks, "due:").length, 2);
	});
});
