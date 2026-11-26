import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TAG_COLOR_SLOT_COUNT, tagColorSlot } from "./tag-color";

describe("tagColorSlot", () => {
	it("is stable for the same tag with or without #", () => {
		assert.equal(tagColorSlot("#test-work"), tagColorSlot("test-work"));
		assert.equal(tagColorSlot("#Test-Work"), tagColorSlot("test-work"));
	});

	it("stays within the palette and cycles", () => {
		const slot = tagColorSlot("alpha");
		assert.ok(slot >= 0 && slot < TAG_COLOR_SLOT_COUNT);
		assert.equal(tagColorSlot("alpha"), slot);
	});
});
