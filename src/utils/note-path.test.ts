import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { noteDisplayName, tagChipLabel } from "./note-path";

describe("note-path helpers", () => {
	it("strips .md for document group titles", () => {
		assert.equal(noteDisplayName("folder/英语阅读学习·索引.md"), "英语阅读学习·索引");
	});

	it("hides leading hash for tag capsules", () => {
		assert.equal(tagChipLabel("#test-work"), "test-work");
		assert.equal(tagChipLabel("plain"), "plain");
	});
});
