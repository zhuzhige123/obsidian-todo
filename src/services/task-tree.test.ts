import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTasksInMarkdown } from "./task-parser";
import { buildTaskTree, buildVisibleForest, computeCheckState } from "./task-tree";

describe("task-tree", () => {
	it("hides collapsed children and rolls up check state", () => {
		const tasks = parseTasksInMarkdown(
			"nest.md",
			["- [ ] Parent", "  - [x] Child A", "  - [ ] Child B"].join("\n"),
		);
		const byId = new Map(tasks.map((t) => [t.id, t]));
		const parent = tasks[0];
		assert.ok(parent);
		assert.equal(computeCheckState(parent, byId, true), "indeterminate");

		const collapsed = new Set([parent.id]);
		const nodes = buildVisibleForest(tasks, {
			collapsedIds: collapsed,
			linkParentChild: true,
			byId,
		});
		assert.equal(nodes.length, 1);
		assert.equal(nodes[0]?.visibleChildCount, 2);
		assert.equal(nodes[0]?.checkState, "indeterminate");
	});

	it("builds a nested tree that keeps children when expanded", () => {
		const tasks = parseTasksInMarkdown(
			"nest.md",
			["- [ ] Parent", "  - [ ] Child A", "  - [ ] Child B"].join("\n"),
		);
		const tree = buildTaskTree(tasks, { linkParentChild: true });
		assert.equal(tree.length, 1);
		assert.equal(tree[0]?.children.length, 2);
		assert.equal(tree[0]?.children[0]?.task.title, "Child A");
		assert.equal(tree[0]?.children[1]?.task.title, "Child B");
		assert.equal(tree[0]?.children[0]?.displayDepth, 1);
	});
});
