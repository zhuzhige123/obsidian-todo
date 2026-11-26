import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	applyDueToTaskLine,
	buildTaskMarkdownLine,
	parseTaskLine,
	parseTasksInMarkdown,
	shiftLineIndent,
	toggleTaskLineCompleted,
} from "./task-parser";

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
		assert.equal(task.dueTime, "05:45");
	});

	it("builds due lines with optional time and rewrites due tokens", () => {
		assert.equal(
			buildTaskMarkdownLine("", "Ship", "2026-11-26", "09:30"),
			"- [ ] Ship 📅 2026-11-26 09:30",
		);
		assert.equal(
			applyDueToTaskLine("- [ ] Ship 📅 2026-11-01", "2026-12-21", "09:30"),
			"- [ ] Ship 📅 2026-12-21 09:30",
		);
		assert.equal(applyDueToTaskLine("- [ ] Ship 📅 2026-11-01 08:00", null), "- [ ] Ship");
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

	it("strips wiki image embeds from title and keeps image refs", () => {
		const task = parseTaskLine(
			"Weave插件开发 - 待解决问题.md",
			4,
			"- [ ] 截图摘录在正文中的高亮范围异常 ![[QQ_1791428157252.png]]",
		);
		assert.ok(task);
		assert.equal(task.title, "截图摘录在正文中的高亮范围异常");
		assert.deepEqual(task.images, ["QQ_1791428157252.png"]);
	});

	it("shifts indent and builds task markdown lines", () => {
		assert.equal(shiftLineIndent("- [ ] A", 2), "  - [ ] A");
		assert.equal(shiftLineIndent("  - [ ] A", -2), "- [ ] A");
		assert.equal(shiftLineIndent("  - [ ] A", -4), "- [ ] A");
		assert.equal(
			buildTaskMarkdownLine("  ", "Child", "2026-11-26"),
			"  - [ ] Child 📅 2026-11-26",
		);
		assert.equal(buildTaskMarkdownLine("", "Root"), "- [ ] Root");
	});

	it("builds parent/child tree from markdown indent", () => {
		const tasks = parseTasksInMarkdown(
			"nest.md",
			[
				"- [ ] Parent #work",
				"  - [ ] Child A",
				"  - [ ] Child B",
				"    - [ ] Grandchild",
				"- [ ] Sibling",
			].join("\n"),
		);
		assert.equal(tasks.length, 5);
		const parent = tasks[0];
		const childA = tasks[1];
		const childB = tasks[2];
		const grand = tasks[3];
		const sibling = tasks[4];
		assert.ok(parent && childA && childB && grand && sibling);
		assert.equal(parent.depth, 0);
		assert.deepEqual(parent.childIds, [childA.id, childB.id]);
		assert.equal(childA.parentId, parent.id);
		assert.equal(childB.parentId, parent.id);
		assert.equal(grand.parentId, childB.id);
		assert.equal(grand.depth, 2);
		assert.equal(sibling.parentId, null);
		assert.deepEqual(sibling.childIds, []);
	});
});
