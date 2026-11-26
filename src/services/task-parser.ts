import type { ParsedTask, TaskPriority } from "../types";

const TASK_LINE_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;

/** Tasks date fields may include one or two times (space or dash separated). */
const DATE_TOKEN = String.raw`\d{4}-\d{2}-\d{2}(?:\s*[T]?\s*\d{1,2}:\d{2}(?::\d{2})?){0,2}`;

const DUE_RE = new RegExp(String.raw`📅\s*(${DATE_TOKEN})`);
const SCHEDULED_RE = new RegExp(String.raw`⏳\s*(${DATE_TOKEN})`);
const CREATED_RE = new RegExp(String.raw`➕\s*(${DATE_TOKEN})`);
const DONE_RE = new RegExp(String.raw`✅\s*(${DATE_TOKEN})`);
const RECURRING_RE = /🔁/;
const TAG_RE = /#([^\s#]+)/g;

const PRIORITY_MARKERS: Array<{ marker: string; priority: TaskPriority }> = [
	{ marker: "🔺", priority: "highest" },
	{ marker: "⏫", priority: "high" },
	{ marker: "🔼", priority: "medium" },
	{ marker: "🔽", priority: "low" },
	{ marker: "⏬", priority: "lowest" },
];

/** Strip Tasks plugin fields from the visible title. */
const STRIP_MARKERS_RE = new RegExp(
	[
		String.raw`🔁\s*[^📅⏳➕✅🛫🔺⏫🔼🔽⏬#\n]*`,
		String.raw`[📅⏳➕✅🛫]\s*${DATE_TOKEN}`,
		String.raw`[🔺⏫🔼🔽⏬]`,
		String.raw`(?:^|\s)(?:id|blockId|dependsOn|onCompletion|created|scheduled|due|start|done)::\S+`,
	].join("|"),
	"gi",
);

function toDateKey(token: string | undefined): string | null {
	if (!token) return null;
	const m = token.match(/(\d{4}-\d{2}-\d{2})/);
	return m?.[1] ?? null;
}

function fingerprint(path: string, title: string, due: string | null, scheduled: string | null): string {
	return `${path}::${title}::${due ?? ""}::${scheduled ?? ""}`;
}

function stripMarkers(body: string): string {
	return body
		.replace(STRIP_MARKERS_RE, " ")
		.replace(TAG_RE, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parsePriority(body: string): TaskPriority {
	for (const item of PRIORITY_MARKERS) {
		if (body.includes(item.marker)) return item.priority;
	}
	return null;
}

function parseTags(body: string): string[] {
	const tags: string[] = [];
	TAG_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TAG_RE.exec(body)) !== null) {
		tags.push(`#${match[1]}`);
	}
	return tags;
}

export function parseTaskLine(path: string, line: number, raw: string): ParsedTask | null {
	const matched = raw.match(TASK_LINE_RE);
	if (!matched) return null;

	const completed = matched[2].toLowerCase() === "x";
	const body = matched[3] ?? "";
	const due = toDateKey(body.match(DUE_RE)?.[1]);
	const scheduled = toDateKey(body.match(SCHEDULED_RE)?.[1]);
	const created = toDateKey(body.match(CREATED_RE)?.[1]);
	const doneDate = toDateKey(body.match(DONE_RE)?.[1]);
	const title = stripMarkers(body);
	if (!title) return null;

	return {
		id: fingerprint(path, title, due, scheduled),
		path,
		line,
		raw,
		completed,
		title,
		due,
		scheduled,
		created,
		doneDate,
		priority: parsePriority(body),
		recurring: RECURRING_RE.test(body),
		hasDescription: false,
		tags: parseTags(body),
	};
}

export function parseTasksInMarkdown(path: string, content: string): ParsedTask[] {
	const lines = content.split(/\r?\n/);
	const tasks: ParsedTask[] = [];
	for (let i = 0; i < lines.length; i++) {
		const task = parseTaskLine(path, i, lines[i] ?? "");
		if (task) tasks.push(task);
	}
	return tasks;
}

/** Toggle checkbox in a raw line; preserve remaining markers. */
export function toggleTaskLineCompleted(raw: string, completed: boolean): string {
	return raw.replace(
		/^(\s*[-*+]\s+)\[([ xX])\]/,
		(`$1[${completed ? "x" : " "}]`),
	);
}
