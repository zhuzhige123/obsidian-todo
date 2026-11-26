import { setIcon } from "obsidian";
import { TASK_BRANCH_PAD_PX, TASK_ROW_PAD_LEFT_PX } from "../constants";
import { el } from "./dom";
import type { DateTimePickerLabels } from "./date-time-picker";
import {
	consumeFocusDraft,
	updateTaskDraftDue,
	updateTaskDraftTitle,
} from "./task-session";

export type TaskDraftRowLabels = DateTimePickerLabels & {
	placeholder: string;
	confirmCreate: string;
};

export interface TaskDraftRowOptions {
	parent: HTMLElement;
	displayDepth: number;
	showGuideLines: boolean;
	due: string | null;
	dueTime: string | null;
	title?: string;
	labels: TaskDraftRowLabels;
	onSubmit: (title: string, due: string | null, dueTime: string | null) => void;
	onCancel: () => void;
	onDueChange: (due: string | null, dueTime: string | null) => void;
}

function safeSetIcon(node: HTMLElement, name: string): void {
	try {
		setIcon(node, name);
	} catch {
		node.textContent = "";
	}
}

/**
 * Draft composer sharing `.todo-task` chrome (no raised card):
 * [+] [twist-spacer] [inline input]
 * Date chips appear only after a real task row is created.
 */
export function renderTaskDraftRow(options: TaskDraftRowOptions): HTMLElement {
	const { labels } = options;
	const depth = Math.max(0, options.displayDepth);

	/* Draft no longer exposes a date control; clear any stale session due. */
	updateTaskDraftDue(null, null);
	options.onDueChange(null, null);

	const row = el("div", {
		cls: [
			"todo-task",
			"todo-task--draft",
			options.showGuideLines && depth > 0 ? "has-nest-branch" : "",
			"todo-task--draft-enter",
		],
		parent: options.parent,
		attr: {
			"data-depth": String(depth),
			"data-draft": "true",
		},
	});
	const branched = options.showGuideLines && depth > 0;
	const rowPad = branched ? TASK_BRANCH_PAD_PX : TASK_ROW_PAD_LEFT_PX;
	row.style.paddingLeft = `${rowPad}px`;
	row.style.setProperty("--todo-row-pad", `${rowPad}px`);

	const confirmBtn = el("button", {
		cls: ["todo-draft__confirm", "clickable-icon", "is-disabled"],
		parent: row,
		attr: {
			type: "button",
			title: labels.confirmCreate,
			"aria-label": labels.confirmCreate,
			disabled: "true",
		},
	});
	safeSetIcon(confirmBtn, "plus");

	/* Keep twist column so the input lines up with sibling titles. */
	el("span", {
		cls: "todo-task__twist-spacer",
		parent: row,
		attr: { "aria-hidden": "true" },
	});

	const main = el("div", { cls: "todo-draft__main", parent: row });
	const input = el("input", {
		cls: "todo-draft__input",
		parent: main,
		attr: {
			type: "text",
			placeholder: labels.placeholder,
			spellcheck: "false",
			autocomplete: "off",
		},
	}) as HTMLInputElement;
	const restored = options.title?.trim() ? options.title : "";
	if (restored) input.value = restored;

	const syncConfirm = (): void => {
		const canSubmit = input.value.trim().length > 0;
		confirmBtn.classList.toggle("is-disabled", !canSubmit);
		confirmBtn.toggleAttribute("disabled", !canSubmit);
	};

	const submit = (): void => {
		const title = input.value.trim();
		if (!title) return;
		options.onSubmit(title, null, null);
	};

	confirmBtn.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		submit();
	});

	input.addEventListener("input", () => {
		updateTaskDraftTitle(input.value);
		syncConfirm();
	});

	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			submit();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			options.onCancel();
		}
	});

	input.addEventListener("click", (event) => event.stopPropagation());
	syncConfirm();

	const shouldFocus = consumeFocusDraft() || restored.length > 0;
	if (shouldFocus) {
		window.setTimeout(() => {
			input.focus();
			if (!restored) input.select();
			else {
				const end = input.value.length;
				input.setSelectionRange(end, end);
			}
		}, 20);
	}

	return row;
}
