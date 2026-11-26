import type { TodoPluginData } from "../types";
import { toLocalDateKey } from "../utils/dates";

/**
 * My Day is plugin-local focus state (not written into markdown).
 * Resets when the local calendar day rolls over.
 */
export class MyDayStore {
	private data: TodoPluginData;

	constructor(data: TodoPluginData) {
		this.data = data;
		this.ensureToday();
	}

	replaceData(data: TodoPluginData): void {
		this.data = data;
		this.ensureToday();
	}

	ensureToday(today: string = toLocalDateKey()): void {
		if (this.data.myDayDate === today) return;
		this.data.myDayDate = today;
		this.data.myDayIds = [];
	}

	getDate(): string {
		this.ensureToday();
		return this.data.myDayDate;
	}

	getIds(): string[] {
		this.ensureToday();
		return [...this.data.myDayIds];
	}

	has(id: string): boolean {
		this.ensureToday();
		return this.data.myDayIds.includes(id);
	}

	add(id: string): boolean {
		this.ensureToday();
		if (this.data.myDayIds.includes(id)) return false;
		this.data.myDayIds.push(id);
		return true;
	}

	remove(id: string): boolean {
		this.ensureToday();
		const before = this.data.myDayIds.length;
		this.data.myDayIds = this.data.myDayIds.filter((x) => x !== id);
		return this.data.myDayIds.length !== before;
	}

	/** Drop ids that no longer exist in the index. */
	pruneMissing(existingIds: Set<string>): void {
		this.ensureToday();
		this.data.myDayIds = this.data.myDayIds.filter((id) => existingIds.has(id));
	}
}
