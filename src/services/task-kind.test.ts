import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ParsedTask } from "../types";
import { getTaskVisualKind } from "./task-kind";

function task(partial: Partial<ParsedTask> & Pick<ParsedTask, "title" | "path">): ParsedTask {
	return {
		id: partial.title,
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
		images: [],
		indent: 0,
		depth: 0,
		parentId: null,
		childIds: [],
		tags: [],
		...partial,
	};
}

describe("getTaskVisualKind", () => {
	it("marks bug notes from path or tags", () => {
		assert.equal(
			getTaskVisualKind(task({ title: "高亮异常", path: "Weave插件开发 - 待解决问题.md" })),
			"bug",
		);
		assert.equal(
			getTaskVisualKind(task({ title: "crash", path: "inbox.md", tags: ["#bug"] })),
			"bug",
		);
	});

	it("keeps regular tasks normal (no milestone chrome)", () => {
		assert.equal(
			getTaskVisualKind(
				task({ title: "静态页面开发", path: "日记/2026-11-21.md", priority: "highest" }),
			),
			"normal",
		);
		assert.equal(
			getTaskVisualKind(task({ title: "常规新建卡片", path: "Weave插件: 简介.md" })),
			"normal",
		);
	});
});
