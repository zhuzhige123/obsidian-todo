import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTaskLine, parseTasksInMarkdown, toggleTaskLineCompleted } from "./task-parser";

describe("task-parser", () => {
	it("parses Tasks emoji due/priority/recurring", () => {
		const task = parseTaskLine(
			"a.md",
			3,
			"- [ ] Finish draft ⏫ 📅 2026-11-26 🔁 every day #work",
		);
		assert.ok(task);
		assert.equal(task.title, "Finish draft");
		assert.equal(task.due, "2026-11-26");
		assert.equal(task.priority, "high");
		assert.equal(task.recurring, true);
		assert.deepEqual(task.tags, ["#work"]);
		assert.equal(task.completed, false);
	});

	it("strips due date with times from title", () => {
		const task = parseTaskLine(
			"a.md",
			1,
			"- [ ] 🎯 测试 📅 2026-11-21 05:45 06:45",
		);
		assert.ok(task);
		assert.equal(task.title, "🎯 测试");
		assert.equal(task.due, "2026-11-21");
	});

	it("parses multiple tasks in a file", () => {
		const tasks = parseTasksInMarkdown(
			"inbox.md",
			["# Inbox", "- [ ] One 📅 2026-11-01", "", "- [x] Two ✅ 2026-11-02"].join("\n"),
		);
		assert.equal(tasks.length, 2);
		assert.equal(tasks[0]?.title, "One");
		assert.equal(tasks[1]?.completed, true);
	});

	it("toggles checkbox without dropping markers", () => {
		const raw = "- [ ] Ship 📅 2026-11-26";
		const done = toggleTaskLineCompleted(raw, true);
		assert.equal(done, "- [x] Ship 📅 2026-11-26");
		assert.equal(toggleTaskLineCompleted(done, false), raw);
	});
});
