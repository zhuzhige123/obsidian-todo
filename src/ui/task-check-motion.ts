import type { ParsedTask } from "../types";
import { computeCheckState } from "../services/task-tree";
import { el } from "./dom";
import { setTaskCollapsed } from "./task-forest";
import {
	clearAutoCollapsedByCheck,
	isAutoCollapsedByCheck,
	markAutoCollapsedByCheck,
} from "./task-session";

/** Shared ease-out motion timings (ms). */
export const MOTION = {
	checkDraw: 200,
	strikeDelay: 50,
	autoCollapseAt: 200,
	highlight: 100,
	/** Uncheck: wait for expand before reverse strike. */
	expandBeforeReverse: 180,
} as const;

export interface CheckMotionOptions {
	enabled: boolean;
	/** Parent auto-fold children after check (setting; default off). */
	autoCollapseOnComplete: boolean;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function findChildrenRail(row: HTMLElement): HTMLElement | null {
	const node = row.closest(".todo-tree-node");
	if (!(node instanceof HTMLElement)) return null;
	const rail = node.querySelector(":scope > .todo-tree-children");
	return rail instanceof HTMLElement ? rail : null;
}

function findTwist(row: HTMLElement): HTMLElement | null {
	const twist = row.querySelector(":scope > .todo-task__twist");
	return twist instanceof HTMLElement ? twist : null;
}

/** Local collapse/expand of the channel rail (independent of full refresh). */
export function setChildrenRailCollapsed(row: HTMLElement, collapsed: boolean): void {
	const rail = findChildrenRail(row);
	const twist = findTwist(row);
	if (rail) rail.classList.toggle("is-collapsed", collapsed);
	if (twist) {
		twist.classList.toggle("is-collapsed", collapsed);
		twist.setAttribute("aria-expanded", String(!collapsed));
	}
}

function applySettledDone(row: HTMLElement, completed: boolean): void {
	row.classList.toggle("is-done", completed);
	row.classList.remove(
		"is-check-flash",
		"is-checking",
		"is-unchecking",
		"is-striking",
		"is-unstriking",
	);
	const check = row.querySelector(":scope > .todo-check");
	if (check instanceof HTMLElement) {
		check.classList.toggle("is-on", completed);
		check.classList.remove("is-drawing", "is-erasing", "is-indeterminate");
		check.setAttribute("aria-checked", String(completed));
	}
}

/**
 * Play the check / uncheck motion chain on a row.
 * When `enabled` is false, applies settled classes instantly.
 */
export async function playTaskCheckMotion(
	row: HTMLElement,
	taskId: string,
	completed: boolean,
	options: CheckMotionOptions,
): Promise<void> {
	if (!options.enabled) {
		applySettledDone(row, completed);
		if (!completed && isAutoCollapsedByCheck(taskId)) {
			setTaskCollapsed(taskId, false);
			setChildrenRailCollapsed(row, false);
			clearAutoCollapsedByCheck(taskId);
		} else if (completed && options.autoCollapseOnComplete && findChildrenRail(row)) {
			setTaskCollapsed(taskId, true);
			setChildrenRailCollapsed(row, true);
			markAutoCollapsedByCheck(taskId);
		}
		return;
	}

	const check = row.querySelector(":scope > .todo-check");
	const hasRail = !!findChildrenRail(row);

	if (completed) {
		row.classList.remove("is-unchecking", "is-unstriking");
		row.classList.add("is-check-flash", "is-checking");
		if (check instanceof HTMLElement) {
			check.classList.remove("is-indeterminate", "is-erasing");
			check.classList.add("is-on", "is-drawing");
			check.setAttribute("aria-checked", "true");
		}

		/* t=50ms: strike + fade */
		await wait(MOTION.strikeDelay);
		row.classList.add("is-striking", "is-done");

		/* t=200ms: optional auto-collapse + check draw settles */
		await wait(MOTION.autoCollapseAt - MOTION.strikeDelay);
		if (options.autoCollapseOnComplete && hasRail) {
			setTaskCollapsed(taskId, true);
			setChildrenRailCollapsed(row, true);
			markAutoCollapsedByCheck(taskId);
		}

		row.classList.remove("is-check-flash", "is-checking", "is-striking");
		if (check instanceof HTMLElement) check.classList.remove("is-drawing");
		return;
	}

	/* ——— uncheck ——— */
	row.classList.remove("is-checking", "is-striking");
	row.classList.add("is-check-flash", "is-unchecking");

	if (isAutoCollapsedByCheck(taskId)) {
		setTaskCollapsed(taskId, false);
		setChildrenRailCollapsed(row, false);
		clearAutoCollapsedByCheck(taskId);
		await wait(MOTION.expandBeforeReverse);
	}

	row.classList.add("is-unstriking");
	row.classList.remove("is-done");
	if (check instanceof HTMLElement) {
		check.classList.remove("is-drawing", "is-indeterminate");
		check.classList.add("is-erasing");
		check.classList.remove("is-on");
		check.setAttribute("aria-checked", "false");
	}

	await wait(MOTION.checkDraw);
	row.classList.remove("is-check-flash", "is-unchecking", "is-unstriking");
	if (check instanceof HTMLElement) check.classList.remove("is-erasing");
}

export function findTaskRowById(host: HTMLElement, taskId: string): HTMLElement | null {
	const rows = host.querySelectorAll(".todo-task[data-id]");
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (row instanceof HTMLElement && row.getAttribute("data-id") === taskId) {
			return row;
		}
	}
	return null;
}

/** Apply settled checkbox / done classes without destroying the row. */
export function applyCheckStateToRow(
	row: HTMLElement,
	state: "checked" | "unchecked" | "indeterminate",
): void {
	row.classList.toggle("is-done", state === "checked");
	row.classList.remove("is-check-flash", "is-checking", "is-unchecking", "is-striking", "is-unstriking");
	const check = row.querySelector(":scope > .todo-check");
	if (!(check instanceof HTMLElement)) return;
	check.classList.toggle("is-on", state === "checked");
	check.classList.toggle("is-indeterminate", state === "indeterminate");
	check.classList.remove("is-drawing", "is-erasing");
	check.setAttribute(
		"aria-checked",
		state === "indeterminate" ? "mixed" : String(state === "checked"),
	);
}

/**
 * After a silent index sync, patch all visible rows for `path` so parent–child
 * rollup matches disk — without rebuilding the list DOM.
 */
export function patchCheckStatesForPath(
	host: HTMLElement,
	path: string,
	byId: Map<string, ParsedTask>,
	linkParentChild: boolean,
): void {
	const rows = host.querySelectorAll(".todo-task[data-id]");
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (!(row instanceof HTMLElement)) continue;
		const id = row.getAttribute("data-id");
		if (!id) continue;
		const task = byId.get(id);
		if (!task || task.path !== path) continue;
		applyCheckStateToRow(row, computeCheckState(task, byId, linkParentChild));
	}
}

/** Remove one task’s tree node in place (hide-completed / My Day). */
export function removeTaskRowLocally(row: HTMLElement): void {
	const node = row.closest(".todo-tree-node");
	const target = node instanceof HTMLElement ? node : row;
	const parentRail = target.parentElement;
	target.remove();
	if (!(parentRail instanceof HTMLElement)) return;
	if (!parentRail.classList.contains("todo-tree-children__inner")) return;
	if (parentRail.childElementCount > 0) return;
	const children = parentRail.parentElement;
	if (!(children instanceof HTMLElement) || !children.classList.contains("todo-tree-children")) {
		return;
	}
	const treeNode = children.parentElement;
	children.remove();
	if (!(treeNode instanceof HTMLElement)) return;
	const parentRow = treeNode.querySelector(":scope > .todo-task");
	parentRow?.classList.remove("has-children");
	const twist = parentRow?.querySelector(":scope > .todo-task__twist");
	if (twist instanceof HTMLElement) {
		const spacer = el("span", {
			cls: "todo-task__twist-spacer",
			attr: { "aria-hidden": "true" },
		});
		twist.replaceWith(spacer);
	}
}
