import { clearChildren, el, svgEl } from "./dom";

export interface MyDayEmptyHandlers {
	onAddTasks: () => void;
}

export interface MyDayEmptyLabels {
	headTitle: string;
	title: string;
	desc: string;
	action: string;
}

/** Flat calendar + sun illustration (no external asset). */
function renderIllustration(parent: HTMLElement): void {
	const wrap = el("div", {
		cls: "todo-myday-empty__art",
		parent,
		attr: { "aria-hidden": "true" },
	});

	const svg = svgEl("svg", {
		cls: "todo-myday-empty__svg",
		parent: wrap,
		attr: {
			viewBox: "0 0 120 108",
			role: "presentation",
		},
	});
	svg.innerHTML = `
		<g fill="none" fill-rule="evenodd">
			<path class="todo-myday-empty__spark" d="M18 34l1.6 3.4L23 39l-3.4 1.6L18 44l-1.6-3.4L13 39l3.4-1.6z"/>
			<path class="todo-myday-empty__spark" d="M96 22l1.2 2.5L100 26l-2.8 1.3L96 30l-1.2-2.7L92 26l2.8-1.5z"/>
			<path class="todo-myday-empty__spark" d="M104 48l1 2.1L107 51l-2 1L104 54l-1-2-3-1 3-1.1z"/>
			<path class="todo-myday-empty__spark" d="M14 58l.9 1.9L17 61l-2.1.9L14 64l-.9-2.1L11 61l2.1-.9z"/>
			<rect class="todo-myday-empty__cal" x="28" y="28" width="64" height="58" rx="10"/>
			<rect class="todo-myday-empty__cal-head" x="28" y="28" width="64" height="16" rx="10"/>
			<rect class="todo-myday-empty__cal-head" x="28" y="36" width="64" height="8"/>
			<rect class="todo-myday-empty__ring" x="42" y="22" width="6" height="14" rx="3"/>
			<rect class="todo-myday-empty__ring" x="72" y="22" width="6" height="14" rx="3"/>
			<circle class="todo-myday-empty__dot" cx="44" cy="56" r="3.2"/>
			<circle class="todo-myday-empty__dot" cx="60" cy="56" r="3.2"/>
			<circle class="todo-myday-empty__dot" cx="76" cy="56" r="3.2"/>
			<circle class="todo-myday-empty__dot" cx="44" cy="70" r="3.2"/>
			<circle class="todo-myday-empty__dot" cx="60" cy="70" r="3.2"/>
			<circle class="todo-myday-empty__dot" cx="76" cy="70" r="3.2"/>
			<circle class="todo-myday-empty__sun" cx="92" cy="30" r="12"/>
			<circle class="todo-myday-empty__sun-core" cx="92" cy="30" r="7.5"/>
		</g>
	`;
}

/**
 * My Day branded empty state — flat illustration + copy + CTA.
 * Host should already be cleared; caller toggles `.is-empty` on the view.
 */
export function renderMyDayEmpty(
	host: HTMLElement,
	dateLabel: string,
	labels: MyDayEmptyLabels,
	handlers: MyDayEmptyHandlers,
): void {
	clearChildren(host);

	const head = el("div", { cls: ["todo-myday-head", "todo-myday-head--empty"], parent: host });
	el("div", { cls: "todo-myday-head__title", text: labels.headTitle, parent: head });
	el("div", { cls: "todo-myday-head__sub", text: dateLabel, parent: head });

	const panel = el("div", {
		cls: "todo-myday-empty",
		parent: host,
		attr: { role: "status" },
	});

	renderIllustration(panel);
	el("div", {
		cls: "todo-myday-empty__title",
		text: labels.title,
		parent: panel,
	});
	el("div", {
		cls: "todo-myday-empty__desc",
		text: labels.desc,
		parent: panel,
	});

	const action = el("button", {
		cls: "todo-myday-empty__action",
		parent: panel,
		attr: { type: "button" },
		text: labels.action,
	});
	action.addEventListener("click", () => handlers.onAddTasks());
}
